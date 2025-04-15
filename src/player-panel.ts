import { S, stime } from "@thegraid/common-lib";
import { afterUpdate, CenterText, NamedContainer, RectShape, TextInRect, UtilButton } from "@thegraid/easeljs-lib";
import { MouseEvent } from "@thegraid/easeljs-module";
import { Player } from "./player";
import { Table } from "./table";


interface ConfirmCont extends NamedContainer {
  textInRect: TextInRect;
  buttonYes: UtilButton;
  buttonCan: UtilButton;
}

export class PlayerPanel extends NamedContainer {

  outline: RectShape;
  get hexMap() { return this.table.hexMap } // dynamic lookup

  /**
   *
   * @param table
   * @param player
   * @param high hex-rows high
   * @param wide hex-cols wide
   * @param row  row at center
   * @param col  col at center
   * @param dir  1: Left->Right; -1: Right->Left
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
    table.hexMap.mapCont.backCont.addChild(this);
    table.setToRowCol(this, row, col);
    this.setOutline();
    this.makeConfirmation();
  }

  get metrics() {
    const map = this.table.hexMap, { dxdc, dydr } = map.xywh(), dir = this.dir, brad = map.radius;
    const wide = dxdc * this.wide, high = dydr * this.high, gap = 6, rowh = 2 * brad + gap;
    return { dir, dydr, wide, high, brad, gap, rowh }
  }

  get objects() {
    const player = this.player, index = player.index, panel: PlayerPanel = this;
    const table  = this.table, gamePlay = this.player.gamePlay;
    return { panel, player, index, table, gamePlay }
  }

  /**
   *
   * @param ss stroke size (4 or 8)
   * @param bgc fill color
   */
  setOutline(ss = 4, bgc = this.bg0) {
    const { wide, high, } = this.metrics;
    this.removeChild(this.outline);
    this.outline = new RectShape({ x: 0, y: 0, w: wide, h: high, s: ss }, bgc, this.player.color);
    this.addChildAt(this.outline, 0);
  }
  bg0 = 'rgba(255,255,255,.3)';
  bg1 = 'rgba(255,255,255,.5)';
  showPlayer(show = (this.player && this.player === this.player.gamePlay.curPlayer)) {
    this.setOutline(show ? 8 : 4, show ? this.bg1 : this.bg0);
  }

  /** areYouSure: delegated from GameState as gameState.panel.areYouSure(...) */
  confirmContainer: ConfirmCont;
  makeConfirmation(query = 'Are you sure?', a1 = 'Yes', a2 = 'Cancel') {
    const c1 = 'lightgreen', c2 = 'rgb(255, 100, 100)'
    const { y: by, width: bwide, height: bhigh } = this.getBounds();
    const { brad, gap, high, wide } = this.metrics;
    const { table } = this.objects, fSize = brad / 3;
    this.confirmContainer = new NamedContainer('confirm') as ConfirmCont;
    const conf = this.confirmContainer;

    const msg = 'Some explanation';
    const label = `${query}\n${msg}`;
    const bgColor = 'rgba(240,240,240,.6)';
    const tir = conf.textInRect = new TextInRect(new CenterText(label), { bgColor });
    const button1 = conf.buttonYes = new UtilButton(a1, { bgColor: c1, fontSize: fSize, active: true });
    const button2 = conf.buttonCan = new UtilButton(a2, { bgColor: c2, fontSize: fSize, active: true });
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

  /** popup the confirmContainer, take yes() or cancel() action
   *
   * (while save/hide/restore the visiblilty of the table.doneButton)
   */
  areYouSure(msg: string, yes: () => void, cancel?: () => void, afterPopup: () => void = () => {}) {
    const { panel, table } = this.objects;
    // save state of doneButton, then disable it:
    const doneVis = table.doneButton.visible;
    table.doneButton.visible = false;
    const conf = this.confirmContainer as ConfirmCont;
    const { textInRect: tir, buttonYes, buttonCan} = conf;

    const clear = (func: () => void) => {
      conf.visible = false;
      buttonYes.removeAllEventListeners();
      buttonCan.removeAllEventListeners();
      // restore state of doneButton:
      table.doneButton.visible = doneVis;
      afterUpdate(conf, func, this);
    }
    buttonCan.visible = !!cancel;
    buttonYes.label_text = !!cancel ? 'Yes' : 'Continue';
    const query = !!cancel ? 'Are your sure?' : 'Click to Confirm';
    const label = `${query}\n${msg}`;
    const { x, y, width: w, height: h } = tir.rectShape.getBounds(); // as extended above
    tir.label_text = label;  // calcBounds: shrink to text+border
    // reset to original-extended rectShape:
    tir.rectShape.setRectRad({ x, y, w, h })
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
