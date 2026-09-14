import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve, basename, extname } from 'node:path';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Events, GatewayIntentBits, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, type TextChannel } from 'discord.js';
import { withCtx, approve, editCaption, holdForSecondSource, reject, reshuffle, retract } from '@newsroom/pipeline';
import { buildReviewCard, BUTTONS } from './embed.ts';
import { COPY_CAPTION_BUTTONS, copyCaptionReply } from './copy-caption.ts';
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) { console.log('Discord token not set; use the dashboard review queue.'); process.exit(0); }
const ownerIds = (process.env.DISCORD_OWNER_IDS ?? '').split(',').filter(Boolean);
if (!ownerIds.length) throw new Error('DISCORD_OWNER_IDS is required for private review controls');
// GuildMessages + MessageContent (a privileged intent — must also be toggled
// on in the Discord Developer Portal under the bot's settings, not just
// requested here) are needed to read a reply's attachments/text; without the
// portal toggle, login below fails with "Used disallowed intents".
const client = new Client({ intents:[GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const styles = {primary:ButtonStyle.Primary,secondary:ButtonStyle.Secondary,danger:ButtonStyle.Danger};
const fileFor = (p:string) => existsSync(p) ? p : resolve(process.env.RENDER_OUT_DIR ?? './.data/renders',basename(p));
const channelFor = (brand:string) => process.env[`DISCORD_REVIEW_${brand.toUpperCase()}_CHANNEL_ID`] ?? process.env.DISCORD_REVIEW_CHANNEL_ID;
// discord.js occasionally hangs forever on a fetch/send instead of rejecting
// (observed against a channel/message the bot can no longer resolve). A
// per-item try/catch does nothing against a hang that never throws, so every
// Discord call in the sweep loop is bounded — a stuck item times out into a
// caught error instead of freezing every review behind it indefinitely.
const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out: ${label}`)), ms))]);
let sweeping = false;
async function sweep() {
  if(sweeping)return; sweeping=true;
  try {
    const snapshot = await withCtx((ctx)=>{ctx.store.expireStaleReviews(ctx.now());return ctx.store;});
    for(const review of snapshot.reviews) {
      const claim=snapshot.getClaim(review.claimId); if(!claim)continue;
      const channelId=channelFor(claim.vertical);if(!channelId)continue;
      const existing=snapshot.notifications.find(n=>n.id===`review:${review.id}`);
      if(!existing&&!['pending','held'].includes(review.state))continue;
      // One review's stale/deleted Discord message (or any other per-item
      // failure) must never abort the batch — every later review in this
      // pass would otherwise silently never get sent or updated.
      try {
        const channel=await withTimeout(client.channels.fetch(channelId),10000,'channels.fetch') as TextChannel|null;if(!channel)continue;
        const card=buildReviewCard(snapshot,review,new Date());
        const embed=new EmbedBuilder().setTitle(card.title.slice(0,256)).setDescription(card.description.slice(0,4000)||'—').setColor(card.colour).setFooter({text:`${review.state} · ${card.footer}`}).addFields(card.fields.map(f=>({...f,value:f.value.slice(0,1024)||'—'})));
        const files:AttachmentBuilder[]=[];
        const existingPaths=card.imagePaths.filter(p=>existsSync(fileFor(p))).slice(0,10);
        existingPaths.forEach((p,i)=>files.push(new AttachmentBuilder(readFileSync(fileFor(p)),{name:`post-${i+1}.png`})));
        if(existingPaths.length)embed.setImage('attachment://post-1.png');
        const row=new ActionRowBuilder<ButtonBuilder>().addComponents(...BUTTONS.map(b=>new ButtonBuilder().setCustomId(`${b.id}:${review.id}`).setLabel(b.label).setStyle(styles[b.style]).setDisabled(!['pending','held'].includes(review.state))));
        const comp=review.compositionId?snapshot.getComposition(review.compositionId):undefined;
        const copyRow=new ActionRowBuilder<ButtonBuilder>().addComponents(...COPY_CAPTION_BUTTONS.map(b=>new ButtonBuilder().setCustomId(`copy:${b.platform}:${review.id}`).setLabel(b.label).setStyle(ButtonStyle.Secondary).setDisabled(!comp?.captionByPlatform[b.platform]?.trim())));
        const payload={embeds:[embed],files,components:[row,copyRow]};
        let message;
        try {
          message=existing
            ?await withTimeout(channel.messages.fetch(existing.messageId),10000,'messages.fetch').then(m=>withTimeout(m.edit({...payload,attachments:[]}),15000,'message.edit'))
            :await withTimeout(channel.send(payload),15000,'channel.send');
        } catch(e) {
          // The tracked message (wrong channel, deleted, gone stale, or the
          // fetch/edit just timed out) — post fresh instead of dying here.
          message=await withTimeout(channel.send(payload),15000,'channel.send (fallback)');
        }
        await withCtx(ctx=>{const n=ctx.store.notifications.find(n=>n.id===`review:${review.id}`);if(n){n.channel=channelId;n.messageId=message.id;n.updatedAt=new Date();}else ctx.store.notifications.push({id:`review:${review.id}`,channel:channelId,messageId:message.id,updatedAt:new Date()});});
      } catch(e) {
        console.error(JSON.stringify({stage:'discord-sweep',reviewId:review.id,error:(e as Error).message}));
      }
    }
    const sends = [
      ...snapshot.decisions.map(d=>({id:`decision:${d.id}`,channel:process.env.DISCORD_FIREHOSE_CHANNEL_ID,text:`${d.rule} → ${d.outcome}: ${d.reason}\n${snapshot.getClaim(d.claimId)?.headline??d.claimId}`})),
      ...snapshot.posts.filter(p=>['published','simulated'].includes(p.status)).map(p=>({id:`post:${p.id}`,channel:process.env.DISCORD_PUBLISHED_CHANNEL_ID,text:`${p.status} · ${p.platform} · ${p.platformPostId??p.id}`})),
      ...snapshot.events.filter(e=>e.level==='error').slice(-30).map(e=>({id:`error:${e.id}`,channel:process.env.DISCORD_ALERTS_CHANNEL_ID,text:`${e.stage}: ${e.msg}\n${JSON.stringify(e.meta).slice(0,1200)}`})),
    ];
    for(const name of ['workerHeartbeat','agentHeartbeat']) {
      const value=snapshot.setting<string|null>(name,null);
      if(value&&Date.now()-Date.parse(value)>120000)sends.push({id:`watchdog:${name}:${value}`,channel:process.env.DISCORD_ALERTS_CHANNEL_ID,text:`${name.replace('Heartbeat','')} has not checked in for two minutes. Inspect Ops.`});
    }
    for(const send of sends) {
      if(!send.channel||snapshot.notifications.some(n=>n.id===send.id))continue;
      const channel=await client.channels.fetch(send.channel) as TextChannel|null;if(!channel)continue;
      const msg=await channel.send({content:send.text.slice(0,1900),allowedMentions:{parse:[]}});
      await withCtx(ctx=>ctx.store.notifications.push({id:send.id,channel:send.channel!,messageId:msg.id,updatedAt:new Date()}));
    }
  } finally {sweeping=false;}
}
client.once(Events.ClientReady,async()=>{
  const guildId=process.env.DISCORD_GUILD_ID;
  if(guildId)await client.application!.commands.create(new SlashCommandBuilder().setName('retract').setDescription('Cancel a queued post or request manual removal').addStringOption(o=>o.setName('post_id').setDescription('Ops post ID').setRequired(true)).toJSON(),guildId);
  void sweep().catch(console.error);setInterval(()=>void sweep().catch(console.error),20000);
});
client.on(Events.InteractionCreate,async i=>{
  if(!i.isButton()&&!i.isModalSubmit()&&!i.isChatInputCommand())return;
  try {
    if(!ownerIds.includes(i.user.id)) {await i.reply({content:'Only the configured owner can review posts.',ephemeral:true});return;}
    if(i.isButton()&&i.customId.startsWith('copy:')) {
      await i.deferReply({ephemeral:true});
      const [,platform,id]=i.customId.split(':');
      const button=COPY_CAPTION_BUTTONS.find(b=>b.platform===platform);
      if(!button||!id)throw new Error('Unknown caption platform');
      const caption=await withCtx(ctx=>{const review=ctx.store.getReview(id);return review?.compositionId?ctx.store.getComposition(review.compositionId)?.captionByPlatform[button.platform]:undefined;});
      if(!caption?.trim())throw new Error('No caption is available for this platform yet.');
      await i.editReply(copyCaptionReply(caption,button.platform));return;
    }
    if(i.isButton()&&i.customId.startsWith('edit:')) {
      const id=i.customId.slice(5);const caption=await withCtx(ctx=>{const r=ctx.store.getReview(id);return r?.compositionId?ctx.store.getComposition(r.compositionId)?.captionByPlatform.x??'':'';});
      await i.showModal(new ModalBuilder().setCustomId(`editmodal:${id}`).setTitle('Edit X caption').addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('caption').setLabel('Caption').setStyle(TextInputStyle.Paragraph).setMaxLength(280).setValue(caption))));return;
    }
    await i.deferReply({ephemeral:true});
    let text='Updated.';
    if(i.isModalSubmit()) {const id=i.customId.slice('editmodal:'.length);const caption=i.fields.getTextInputValue('caption');await withCtx(ctx=>{const r=ctx.store.getReview(id);if(!r?.compositionId)throw new Error('Render the review first');return editCaption(ctx,r.compositionId,'x',caption);});}
    else if(i.isChatInputCommand()) {const id=i.options.getString('post_id',true);const out=await withCtx(ctx=>retract(ctx,id));text=out.manualRemovalRequired?'Marked for retraction. Remove the live post on the platform, then reconcile it in Ops.':'Queued post cancelled.';}
    else {const [action,id]=i.customId.split(':');await withCtx(async ctx=>{switch(action){case 'publish':await approve(ctx,id!);text='Queued subject to pacing and warm-up.';break;case 'reject':reject(ctx,id!);break;case 'hold':holdForSecondSource(ctx,id!);text='Held until eligible R3 corroboration, or expiry.';break;case 'reshuffle':await reshuffle(ctx,id!);break;default:throw new Error('unknown action');}});}
    await i.editReply(text);void sweep().catch(console.error);
  }catch(e){const msg=(e as Error).message;if(i.deferred||i.replied)await i.editReply(msg).catch(console.error);else await i.reply({content:msg,ephemeral:true}).catch(console.error);}
});
// A reply (with an attached image, or a message containing a direct image
// URL) to a review card swaps in that photo and forces a recompose — the
// human-in-the-loop answer to "no source photo" that needs no scraping, no
// paid API, and no copyright guesswork: the reviewer picked it themselves.
const IMAGE_URL_RE = /https?:\/\/\S+\.(?:png|jpe?g|webp|gif)(?:\?\S*)?/i;
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !ownerIds.includes(message.author.id) || !message.reference?.messageId) return;
  try {
    const referenced = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    if (!referenced) return;
    const notif = await withCtx((ctx) => ctx.store.notifications.find((n) => n.messageId === referenced.id && n.id.startsWith('review:')));
    if (!notif) return; // reply to something other than one of our review cards
    const reviewId = notif.id.slice('review:'.length);

    const attachment = message.attachments.find((a) => a.contentType?.startsWith('image/'));
    const linkedUrl = message.content.match(IMAGE_URL_RE)?.[0];
    const sourceUrl = attachment?.url ?? linkedUrl;
    if (!sourceUrl) { await message.reply('Attach an image, or paste a direct image URL, to update this post\'s photo.').catch(() => {}); return; }

    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`could not download that image (${res.status})`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const outDir = process.env.RENDER_OUT_DIR ?? './.data/renders';
    mkdirSync(outDir, { recursive: true });
    const localPath = resolve(outDir, `upload-${reviewId}-${Date.now()}${extname(attachment?.name ?? sourceUrl).slice(0, 5) || '.png'}`);
    await writeFile(localPath, bytes);

    const comp = await withCtx(async (ctx) => {
      const review = ctx.store.getReview(reviewId);
      if (!review) throw new Error('review not found (expired or already resolved?)');
      const claim = ctx.store.getClaim(review.claimId);
      if (!claim) throw new Error('claim not found');
      claim.imageUrl = localPath;
      return reshuffle(ctx, reviewId);
    });
    // Show the actual recomposed result right here, rather than a bare ✅ and
    // making the reviewer wait for the next 20s sweep tick to see it land.
    const newImage = comp.imagePaths[0];
    if (newImage && existsSync(fileFor(newImage))) {
      await message.reply({ content: 'Updated:', files: [new AttachmentBuilder(readFileSync(fileFor(newImage)), { name: 'updated.png' })] }).catch(() => {});
    } else {
      await message.react('✅').catch(() => {});
    }
    await sweep().catch(console.error); // also refresh the review card itself, not just this reply
  } catch (e) {
    await message.reply((e as Error).message).catch(() => {});
  }
});
await client.login(token);
