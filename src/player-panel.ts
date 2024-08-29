import { afterUpdate, CenterText, S, stime } from "@thegraid/easeljs-lib";
import { Container, Graphics, MouseEvent, Text } from "@thegraid/easeljs-module";
import { NamedContainer } from "./game-play";
import { Player } from "./player";
import { RectShape, UtilButton } from "./shapes";
import { Table } from "./table";
import { TP } from "./table-params";


interface ConfirmCont extends NamedContainer {
  titleText: Text;
  messageText: Text;
  buttonYes: UtilButton;
  buttonCan: UtilButton;
}

export class PlayerPanel extends NamedContainer {

  outline: RectShape;
  get hexMap() { return this.table.gamePlay.hexMap } // dynamic lookup

  /**
   *
   * @param table
   * @param player
   * @param high
   * @param wide
   * @param row
   * @param col
   * @param dir
   */
  constructor(
    public table: Table,
    public player: Player,
    public high: number,
    public wide: number,
    row: number,
    col: number,
    public dir = -1
  ) {
    super(player.Aname);              // for debugger
    table.hexMap.mapCont.resaCont.addChild(this);
    table.setToRowCol(this, row, col);
    this.setOutline();
    this.makeConfirmation();
  }

  get metrics() {
    const { dxdc, dydr } = this.table.hexMap.xywh, dir = this.dir;
    const wide = dxdc * this.wide, high = dydr * this.high, brad = TP.hexRad, gap = 6, rowh = 2 * brad + gap;
    return { dir, dydr, wide, high, brad, gap, rowh }
  }

  get objects() {
    const player = this.player, index = player.index, panel: PlayerPanel = this;
    const table  = this.table, gamePlay = this.player.gamePlay;
    return { panel, player, index, table, gamePlay }
  }

  /**
   *
   * @param t1 stroke width (2)
   * @param bgc fill color
   */
  setOutline(t1 = 2, bgc = this.bg0) {
    const { wide, high, } = this.metrics;
    const t2 = t1 * 2 + 1, g = new Graphics().ss(t2);
    this.removeChild(this.outline);
    this.outline = new RectShape({ x: -t1, y: -t1, w: wide + t2, h: high + t2 }, bgc, this.player.color, g);
    this.addChildAt(this.outline, 0);
  }
  bg0 = 'rgba(255,255,255,.3)';
  bg1 = 'rgba(255,255,255,.5)';
  showPlayer(show = (this.player && this.player === this.player.gamePlay.curPlayer)) {
    this.setOutline(show ? 4 : 2, show ? this.bg1 : this.bg0);
  }

  confirmContainer: ConfirmCont;
  /** create the 'Are you sure' popup. */
  makeConfirmation(query = 'Are you sure?', a1 = 'Yes', a2 = 'Cancel') {
    const c1 = 'lightgreen', c2 = 'rgb(255, 100, 100)'
    const { wide, high, brad, gap, rowh } = this.metrics;
    const { table } = this.objects;
    const conf = this.confirmContainer = new NamedContainer('confirm') as ConfirmCont;
    const bg0 = new RectShape({ x: 0, y: - brad - gap, w: wide, h: high }, '', '');
    bg0.paint('rgba(240,240,240,.2)');
    const bg1 = new RectShape({ x: 0, y: 4 * rowh - brad - 2 * gap, w: wide, h: high - 4 * rowh + gap }, '', '');
    bg1.paint('rgba(240,240,240,.8)');

    const title = conf.titleText = new CenterText(query, 30);
    title.x = wide / 2;
    title.y = 3.85 * rowh;
    const msgText = conf.messageText = new CenterText('', 30);
    msgText.x = wide / 2;
    msgText.y = 5 * rowh;
    const button1 = conf.buttonYes = new UtilButton(c1, a1, TP.hexRad);
    const button2 = conf.buttonCan = new UtilButton(c2, a2, TP.hexRad);
    button1.y = button2.y = 6 * rowh;
    button1.x = wide * .4;
    button2.x = wide * .6;
    conf.addChild(bg0, bg1, button1, button2, msgText, title, );
    conf.visible = false;
    table.overlayCont.addChild(conf);
  }

  /** keybinder access to areYouSure */
  clickConfirm(yes = true) {
    // let target = (this.confirmContainer.children[2] as UtilButton);
    if (!this.confirmContainer.visible) return;
    const buttonYes = this.confirmContainer.buttonYes;
    const buttonCan = this.confirmContainer.buttonCan;
    const nativeMouseEvent = undefined as any as NativeMouseEvent;
    const event = new MouseEvent(S.click, false, true, 0, 0, nativeMouseEvent, -1, true, 0, 0);
    (yes ? buttonYes : buttonCan).dispatchEvent(event);
  }

  /** popup the confirmContainer, take yes() or cancel() action */
  areYouSure(msg: string, yes: () => void, cancel?: () => void, afterPopup: () => void = () => {}) {
    const { panel, table } = this.objects, doneVis = table.doneButton.visible;
    table.doneButton.mouseEnabled = table.doneButton.visible = false;
    const conf = this.confirmContainer;
    const button1 = conf.buttonYes;
    const button2 = conf.buttonCan;
    const msgText = conf.children[4] as CenterText;
    msgText.text = msg;
    const clear = (func: () => void) => {
      conf.visible = false;
      button1.removeAllEventListeners();
      button2.removeAllEventListeners();
      table.doneButton.mouseEnabled = table.doneButton.visible = doneVis;
      afterUpdate(conf, func, this);
    }
    button2.visible = !!cancel;
    button1.label_text = !!cancel ? 'Yes' : 'Continue';
    conf.titleText.text = !!cancel ? 'Are your sure?' : 'Click to Confirm';

    button1.on(S.click, () => clear(yes), this, true);
    button2.on(S.click, () => clear(cancel ?? yes), this, true);
    console.log(stime(this, `.areYouSure? [${this.player.Aname}], ${msg}`));
    panel.localToLocal(0, 0, table.overlayCont, conf);
    conf.visible = true;
    afterUpdate(conf, afterPopup, this);
    // setTimeout(cancel, 500);
  }
}
