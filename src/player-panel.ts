import { afterUpdate, CenterText, S, stime } from "@thegraid/easeljs-lib";
import { Graphics, MouseEvent } from "@thegraid/easeljs-module";
import { NamedContainer } from "./game-play";
import { Player } from "./player";
import { RectShape, TextInRect, UtilButton } from "./shapes";
import { Table } from "./table";
import { TP } from "./table-params";


interface ConfirmCont extends NamedContainer {
  textInRect: TextInRect;
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
  makeConfirmation(query = 'Are you sure?', a1 = 'Yes', a2 = 'Cancel') {
    const c1 = 'lightgreen', c2 = 'rgb(255, 100, 100)'
    const { y: by, width: bwide, height: bhigh } = this.getBounds();
    const { gap, high, wide } = this.metrics;
    const { table } = this.objects, fSize = TP.hexRad / 3;
    this.confirmContainer = new NamedContainer('confirm') as ConfirmCont;
    const conf = this.confirmContainer;

    const msg = 'Some explanation';
    const label = `${query}\n${msg}`;
    const bgColor = 'rgba(240,240,240,.6)';
    const tir = conf.textInRect = new TextInRect(new CenterText(label), bgColor);
    const button1 = conf.buttonYes = new UtilButton(a1, c1, fSize*1);
    const button2 = conf.buttonCan = new UtilButton(a2, c2, fSize*1);
    tir.addChild(button1, button2);
    const { y: y, height: th } = tir.getBounds();
    const { height: bh } = button1.getBounds()
    const bt = (th - 2 * gap), h = (bh + th)
    tir.rectShape.setRectRad({ x: - wide / 2, y: y, w: wide, h: h })
    tir.rectShape.setBounds(undefined, 0, 0, 0);
    tir.paint(undefined, true); // force paint new rectShape (retain the graphics)
    // cont is placed at (0, 0) of PlayerPanel, offset from there:
    tir.x = wide / 2
    tir.y = bhigh - h + tir.label.getMeasuredLineHeight() / 2;

    button1.y = button2.y = bt;
    button1.x = wide * -.15;
    button2.x = wide * +.15;

    conf.addChild(tir);
    conf.visible = false

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
    const conf = this.confirmContainer as ConfirmCont;
    const { textInRect: tir, buttonYes, buttonCan} = conf;

    const clear = (func: () => void) => {
      conf.visible = false;
      buttonYes.removeAllEventListeners();
      buttonCan.removeAllEventListeners();
      table.doneButton.mouseEnabled = table.doneButton.visible = doneVis;
      afterUpdate(conf, func, this);
    }
    buttonCan.visible = !!cancel;
    buttonYes.label_text = !!cancel ? 'Yes' : 'Continue';
    const query = !!cancel ? 'Are your sure?' : 'Click to Confirm';
    const label = `${query}\n${msg}`;
    const { x, y, width: w, height: h } = tir.rectShape.getBounds(); // as extended above
    tir.label_text = label;             // calcBounds: shrink to text+border
    // const { x, y } = tir.rectShape.getBounds();
    tir.rectShape.setRectRad({x, y, w, h})
    tir.rectShape.setBounds(undefined, 0, 0, 0)
    tir.setBounds(x, y, w, h)
    tir.rectShape.paint(undefined, true)

    buttonYes.on(S.click, () => clear(yes), this, true);
    buttonCan.on(S.click, () => clear(cancel ?? yes), this, true);
    console.log(stime(this, `.areYouSure? [${this.player.Aname}], ${msg}`));
    panel.localToLocal(0, 0, table.overlayCont, conf);
    conf.visible = true;
    afterUpdate(conf, afterPopup, this);
    // setTimeout(cancel, 500);
  }
}
