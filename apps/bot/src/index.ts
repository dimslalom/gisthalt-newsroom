import { readFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Events, GatewayIntentBits, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, type TextChannel } from 'discord.js';
import { withCtx, approve, editCaption, holdForSecondSource, reject, reshuffle, retract } from '@newsroom/pipeline';
import { buildReviewCard, BUTTONS } from './embed.ts';
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) { console.log('Discord token not set; use the dashboard review queue.'); process.exit(0); }
const ownerIds = (process.env.DISCORD_OWNER_IDS ?? '').split(',').filter(Boolean);
if (!ownerIds.length) throw new Error('DISCORD_OWNER_IDS is required for private review controls');
const client = new Client({ intents:[GatewayIntentBits.Guilds] });
const styles = {primary:ButtonStyle.Primary,secondary:ButtonStyle.Secondary,danger:ButtonStyle.Danger};
const fileFor = (p:string) => existsSync(p) ? p : resolve(process.env.RENDER_OUT_DIR ?? './.data/renders',basename(p));
const channelFor = (brand:string) => process.env[`DISCORD_REVIEW_${brand.toUpperCase()}_CHANNEL_ID`] ?? process.env.DISCORD_REVIEW_CHANNEL_ID;
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
      const channel=await client.channels.fetch(channelId) as TextChannel|null;if(!channel)continue;
      const card=buildReviewCard(snapshot,review,new Date());
      const embed=new EmbedBuilder().setTitle(card.title.slice(0,256)).setDescription(card.description.slice(0,4000)||'—').setColor(card.colour).setFooter({text:`${review.state} · ${card.footer}`}).addFields(card.fields.map(f=>({...f,value:f.value.slice(0,1024)||'—'})));
      const files=[];
      if(card.imagePath&&existsSync(fileFor(card.imagePath))) {files.push(new AttachmentBuilder(readFileSync(fileFor(card.imagePath)),{name:'post.png'}));embed.setImage('attachment://post.png');}
      const row=new ActionRowBuilder<ButtonBuilder>().addComponents(...BUTTONS.map(b=>new ButtonBuilder().setCustomId(`${b.id}:${review.id}`).setLabel(b.label).setStyle(styles[b.style]).setDisabled(!['pending','held'].includes(review.state))));
      const payload={embeds:[embed],files,components:[row]};
      // Persist IDs after delivery, so a normal restart edits the original card.
      const message=existing?await channel.messages.fetch(existing.messageId).then(m=>m.edit({...payload,attachments:[]})):await channel.send(payload);
      await withCtx(ctx=>{const n=ctx.store.notifications.find(n=>n.id===`review:${review.id}`);if(n)n.updatedAt=new Date();else ctx.store.notifications.push({id:`review:${review.id}`,channel:channelId,messageId:message.id,updatedAt:new Date()});});
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
await client.login(token);
