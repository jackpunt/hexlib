import { stime } from '@thegraid/common-lib';
import { Container, Text } from '@thegraid/easeljs-module';
import { F } from '@thegraid/common-lib';
import { TP } from './table-params';

export class TextLog extends Container {
  /**
   *
   * @param Aname
   * @param nlines
   * @param size fontSize [TP.hexRad/2]
   * @param lead between lines [3]
   */
  constructor(public Aname: string, nlines = 6, public size = TP.hexRad / 2, public lead = 3) {
    super();
    this.lines = new Array<Text>(nlines);
    for (let ndx = 0; ndx < nlines; ndx++) this.lines[ndx] = this.newText(`//0:`);
    this.addChild(...this.lines);
  }

  lines: Text[];
  lastLine = '';
  nReps = 0;

  height(n = this.lines.length) {
    return (this.size + this.lead) * n;
  }

  clear() {
    this.lines.forEach(tline => tline.text = '');
    this.stage?.update();
  }

  private newText(line = '') {
    const text = new Text(line, F.fontSpec(this.size));
    text.textAlign = 'left';
    text.mouseEnabled = false;
    return text;
  }

  private spaceLines(cy = 0, lead = this.lead) {
    this.lines.forEach(tline => (tline.y = cy, cy += tline.getMeasuredLineHeight() + lead));
  }

  /** convert line to single-line; inc count if same line; insert & scroll up */
  log(line: string, from = '', toConsole = true) {
    line = line.replace(/\n/g, '-');
    toConsole && console.log(stime(`${from}:`), line);
    if (line === this.lastLine) {
      this.lines[this.lines.length - 1].text = `[${++this.nReps}] ${line}`;
    } else {
      this.removeChild(this.lines.shift() as Text);
      this.lines.push(this.addChild(this.newText(line)));
      this.spaceLines();
      this.lastLine = line;
      this.nReps = 0;
    }
    this.stage?.update();
    return line;
  }
}
