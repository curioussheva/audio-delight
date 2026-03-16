export interface LirikLine {
  time: number; // dalam milidetik
  text: string;
}

export const parseLRC = (lrcText: string): LirikLine[] => {
  const lines = lrcText.split('\n');
  const result: LirikLine[] = [];
  const timeReg = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;

  lines.forEach((line) => {
    const text = line.replace(timeReg, '').trim();
    if (!text) return;

    let match;
    timeReg.lastIndex = 0;
    while ((match = timeReg.exec(line)) !== null) {
      const min = parseInt(match[1]);
      const sec = parseInt(match[2]);
      const ms = parseInt(match[3].padEnd(3, '0'));
      const time = min * 60 * 1000 + sec * 1000 + ms;
      result.push({ time, text });
    }
  });

  return result.sort((a, b) => a.time - b.time);
};
