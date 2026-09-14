import { describe, expect, it } from 'vitest';
import { copyCaptionReply } from '../apps/bot/src/copy-caption.ts';

describe('Discord caption copy replies', () => {
  it('preserves formatting and prevents mentions', () => {
    const caption = '**Race results**\n\n@everyone 🏁 #F1';
    expect(copyCaptionReply(caption, 'x')).toEqual({
      content: `\`\`\`\n${caption}\n\`\`\``, allowedMentions: { parse: [] },
    });
  });

  it('includes a full Instagram caption beyond the message limit', () => {
    const caption = 'a'.repeat(2200);
    expect(copyCaptionReply(caption, 'instagram').embeds).toEqual([{ description: `\`\`\`\n${caption}\n\`\`\`` }]);
  });

  it.each(['🏁'.repeat(2200), 'Caption with ``` embedded fences'])('attaches captions that cannot fit safely without truncating', caption => {
    const reply = copyCaptionReply(caption, 'instagram');
    expect(reply.files).toEqual([{ attachment: Buffer.from(caption, 'utf8'), name: 'instagram-caption.txt' }]);
  });
});
