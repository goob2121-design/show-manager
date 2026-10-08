// Original experimental text only. No production song data is read or written.
export const SMART_PAGING_SAMPLES = {
  realistic: `[Verse 1]
Morning light across the stage
Another turn, another page
A quiet room, a steady sound
Our feet are planted on the ground

[Chorus]
Follow the rhythm, follow the light
Keep every word within our sight
One little verse, one open door
Then let the music carry more

[Verse 2]
The road runs past the evening glow
We take our time and let it flow
A passing breeze, a distant train
The melody comes back again
We find the words along the way
And leave a little room to play

[Chorus]
Follow the rhythm, follow the light
Keep every word within our sight
One little verse, one open door
Then let the music carry more

[Verse 3]
The room is warm, the lights are low
The next few lines begin to show
A gentle note, a simple rhyme
We turn the page and keep our time

[Bridge]
Across the hills the echoes ring
We make a space for everything
A quiet breath before the turn
Another lesson still to learn
The strings remember where to go
The verses travel soft and slow
We hold the last note in the air
And find the final chorus there

[Final Chorus]
Follow the rhythm, follow the light
Keep every word within our sight
One little verse, one open door
Then let the music carry more`,
  overflow: `[Long verse — chord and wrapping test]
${Array.from({ length: 24 }, (_, index) => `[G] Line ${index + 1}: We follow the long winding road past the last evening lantern, [Cadd9] remembering every quiet word and every punctuation mark — nothing should disappear.`).join("\n")}

[Single very long line]
${"[Am7] A single unbroken lyric line keeps travelling across the evening landscape; every word stays here! ".repeat(35)}

[Short ending]
[G] One last note.
[C] Let it ring.`,
};
