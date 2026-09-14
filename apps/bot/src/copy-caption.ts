import type { InteractionEditReplyOptions } from 'discord.js';

export const COPY_CAPTION_BUTTONS = [
  { platform: 'instagram', label: 'Copy IG caption' },
  { platform: 'x', label: 'Copy Twitter caption' },
  { platform: 'threads', label: 'Copy Threads caption' },
  { platform: 'tiktok', label: 'Copy TikTok caption' },
] as const;

/** Keep the exact caption intact, including Markdown, newlines and emoji. */
export function copyCaptionReply(caption: string, platform: string): InteractionEditReplyOptions {
  const block = `\`\`\`\n${caption}\n\`\`\``;
  // A text attachment handles captions that cannot safely fit a code block.
  if (caption.includes('```') || block.length > 4096) {
    return {
      content: 'Your full caption is attached. Open it to copy the text.',
      files: [{ attachment: Buffer.from(caption, 'utf8'), name: `${platform}-caption.txt` }],
      allowedMentions: { parse: [] },
    };
  }
  return block.length <= 2000
    ? { content: block, allowedMentions: { parse: [] } }
    : { embeds: [{ description: block }], allowedMentions: { parse: [] } };
}
