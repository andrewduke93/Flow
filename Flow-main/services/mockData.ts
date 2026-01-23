import { Book, Chapter } from '../types';
import { calculateWordCount } from '../utils';

// Factory to mimic Swift `init` logic for Chapter
const createChapter = (id: string, title: string, content: string, sortOrder: number): Chapter => {
  const wordCount = calculateWordCount(content);
  return {
    id,
    title,
    content,
    sortOrder,
    wordCount
  };
};

const CHAPTER_1 = `
<p>Yo, dude. The internet is totally bonkers right now. Just way too much noise.</p>
<p>Your brain probably feels like burnt toast. <strong>Flow</strong> is the opposite of that. It’s just a chill corner to hang out with a book.</p>
<p>No beeping. No distractions. Just you and the stories, man.</p>
<p>Take a breath. It’s gonna be okay.</p>
`;

const CHAPTER_2 = `
<p>Check it out, we got two ways to do this.</p>
<p>First is <strong>Scroll Mode</strong>. That's the classic style. Nice and slow. Like eating a sandwich one bite at a time.</p>
<p>Then, there's <strong>Flow Mode</strong>. That’s the big Play button. It shoots words at you one by one. Sounds crazy, but it's actually super mathematical. It's like the book is reading itself to you. Just tap it and relax.</p>
`;

const CHAPTER_3 = `
<p>Moving your eyes left and right is a lot of work, man. Too much exercise.</p>
<p>In Flow Mode, you don't gotta move at all.</p>
<p>Just look at the <span style="color: #E25822;">red letter</span>. That's the sweet spot. Keep your eyes soft and locked there, and the words just melt into your brain. It’s like telepathy, dude.</p>
`;

const CHAPTER_4 = `
<p>That capsule at the bottom? That's your control panel.</p>
<ul>
<li><strong>The Scrubber:</strong> Drag it to jump around time. It clicks! So satisfying.</li>
<li><strong>The Tuner:</strong> Speed is key. If it's too slow, crank it up. If it's too fast, slow it down. Find your groove.</li>
<li><strong>The Visuals:</strong> Tap the settings to change the font. Make it look algebraic.</li>
</ul>
`;

const CHAPTER_5 = `
<p>This guide is nice, but you gotta bring your own loot.</p>
<p>You got some <strong>EPUBs</strong> stashed away, right?</p>
<ol>
<li>Head back to the <strong>Bookshelf</strong>.</li>
<li>Hit the <strong>Add Book</strong> button.</li>
<li>Load 'em up.</li>
</ol>
<p>We’ll fix the formatting. You just stretch out and enjoy the silence. Maybe make some bacon pancakes.</p>
`;

export const generateMockBooks = (): Book[] => {
  return [
    {
      id: 'guide-book-v1',
      title: "welcome to flow",
      author: "Flowy",
      // Warm, sunlit book pages. Friendly, inviting, and matches the orange accent.
      coverUrl: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?q=80&w=1000&auto=format&fit=crop", 
      tintColorHex: "#E25822", // Ember
      lastOpened: new Date(),
      isFinished: false,
      bookmarkProgress: 0,
      chapters: [
        createChapter('g1', 'The Noise', CHAPTER_1, 0),
        createChapter('g2', 'Two Speeds', CHAPTER_2, 1),
        createChapter('g3', 'The Red Letter', CHAPTER_3, 2),
        createChapter('g4', 'Vibe Check', CHAPTER_4, 3),
        createChapter('g5', 'Your Stash', CHAPTER_5, 4),
      ]
    }
  ];
};