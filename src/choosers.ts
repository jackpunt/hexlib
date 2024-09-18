import { C, S } from "@thegraid/common-lib"
import { BoolChoice, ChoiceItem, ChoiceStyle, Chooser, DropdownButton, DropdownChoice, DropdownItem, DropdownStyle, EditBox, KeyBinder, ParamItem, ParamLine, TextStyle } from "@thegraid/easeljs-lib"

/** no choice: a DropdownChoice with 1 mutable item that can be set by setValue(...) */
export class NC extends DropdownChoice {
  static style(defStyle: DropdownStyle) {
    let baseStyle = DropdownButton.mergeStyle(defStyle)
    let pidStyle = { arrowColor: 'transparent', textAlign: 'right' }
    return DropdownButton.mergeStyle(pidStyle, baseStyle)
  }
  constructor(items: DropdownItem[], item_w: number, item_h: number, defStyle: DropdownStyle = {}) {
    super(items, item_w, item_h, NC.style(defStyle))
  }
  /** never expand */
  override rootclick(): void {}

  override setValue(value: string, item: ParamItem, target: object): boolean {
    item.value = value // for reference?
    this._rootButton.text.text = value
    return true
  }
}

/** Chooser with an EditBox
 *
 * Bind M-v to pasteClipboard()
 *
 *
 */
export class EBC extends Chooser {
  editBox: EditBox;
  /**
   *
   * @param items
   * @param item_w width of EditBox
   * @param item_h height of EditBox
   * @param style [textColor: BLACK] fillColor -> EditBox.bgColor
   */
  constructor(items: ChoiceItem[], item_w: number, item_h: number, style: ChoiceStyle = {}) {
    super(items, item_w, item_h, style)
    const ebStyle = { textColor: C.BLACK, bgColor: style.fillColor, ...style }
    const eb = this.editBox = new EditBox('', ebStyle); // Note: eb.border = 0
    eb.rectShape.setRectRad({ x: 0, y: 0, w: item_w, h: item_h })
    eb.setBounds(undefined, 0, 0, 0)
    this.addChild(this.editBox)
    const scope = this.editBox.keyScope
    KeyBinder.keyBinder.setKey('M-v', () => this.pasteClipboard, scope)
    this.on(S.click, () => this.editBox.setFocus(true), this);
  }

  /**
   * insert text from window system clipboard: await navigator.clipboard.readText();
   * @param pt where to inject text [this.point]
   * @param n number of following chars to delete [0], if n<0 delete ALL following chars
   */
  pasteClipboard(pt = this.editBox.point, n = 0) {
    const paste = async () => {
      let text = await navigator.clipboard.readText();
      this.editBox.splice(pt, n < 0 ? undefined : n, text);
    }
    paste();
  }

  override setValue(value: any, item?: ChoiceItem, target?: object): boolean {
    this.editBox.setText(value)
    return true
  }
}

/** like StatsPanel: read-only output field */
export class PidChoice extends NC {


}

/** present [false, true] with any pair of string: ['false', 'true'] */
export class BC extends BoolChoice {}
