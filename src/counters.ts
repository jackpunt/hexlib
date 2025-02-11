import { S, XY } from "@thegraid/common-lib";
import { RectShape, ValueCounter, ValueEvent } from "@thegraid/easeljs-lib";
import { MouseEvent, Text } from "@thegraid/easeljs-module";

/** ValueCounter in a Rectangle. */ // TODO: RectWithText
export class ValueCounterBox extends ValueCounter {

  /** return width, height; suitable for makeBox() => drawRect()  */
  protected override boxSize(text: Text): { width: number; height: number } {
    const width = text.getMeasuredWidth();
    const height = text.getMeasuredLineHeight();
    const high = height * 1.1;                   // change from ellispe margins
    const wide = Math.max(width * 1.1, high);    // change from ellispe margins
    return { width: wide, height: high };
  }

  protected override makeBox(color: string, high: number, wide: number) {
    return new RectShape({ x: -wide / 2, y: -high / 2, w: wide, h: high }, color, '');
  }
}

export class ButtonBox extends ValueCounterBox {
  constructor(name: string, initValue?: string, color?: string, fontSize?: number, fontName?: string, textColor?: string[]) {
    super(name, initValue, color, fontSize, fontName, textColor);
    this.mouseEnabled = true;
  }
}

/** ValueCounter specifically for number values (not string), includes incValueEvent() and clickToInc() */
export class NumCounter extends ValueCounter {

  override get value() { return this._value as number }
  override set value(value: number) { super.value = value }

  // override for signature: number
  // override getValue(): number { return this.value ?? 0 }
  override setValue(value?: number, color?: string, fontSize?: number, fontName?: string, textColor?: string): void {
      super.setValue(value, color, fontSize, fontName, textColor)
  }

  incValue(incr: number) {
    this.updateValue(this.value + incr);
    this.dispatchEvent(new ValueEvent('incr', incr));
  }
  /**
   *
   * @param incr configure click/incValue:
   * - false: click does nothing
   * - !false: click -> this.incValue()
   * - NumCounter: this.incValue(x) -> incr.incValue(x)
   */
  clickToInc(incr: NumCounter | boolean = true) {
    const incv = (evt: NativeMouseEvent) => (evt?.ctrlKey ? -1 : 1) * (evt?.shiftKey ? 10 : 1);
    if (incr) {
      this.mouseEnabled = true;
      this.on(S.click, (evt: Object) => this.incValue(incv((evt as MouseEvent).nativeEvent)));
      if (incr instanceof NumCounter) {
        this.on('incr', (evt: Object) => incr.incValue((evt as ValueEvent).value as number));
      }
    }
  }
}

/**
 * NumCounterBoxLabeled: larger box to include the label.
 */
export class NumCounterBox extends NumCounter {
  labelH = 0;
  override setLabel(label: string | Text, offset?: XY, fontSize?: number): void {
    fontSize = fontSize ?? this.labelFontSize;
    offset = offset ?? { x: this.label?.x ?? 0, y: this.label?.y || (fontSize / 2) };
    super.setLabel(label, offset, fontSize);
    this.labelH = this.label?.text ? this.labelFontSize ?? 0 : 0;
    this.wide = -1; // force new box
    this.setBoxWithValue(this.value);
  }

  protected makeBox0(color: string, high: number, wide: number) {
    return new RectShape({ x: -wide / 2, y: -high / 2, w: wide, h: high }, color, '')
  }

  // a little bit taller than basic text box, room for label
  protected override makeBox(color: string, high: number, wide: number) {
    const yinc = this.label ? this.labelFontSize / 2 : 0; // dubious math; but works for now...
    const shape = this.makeBox0(color, high + yinc, wide); // 4 px beneath for label
    shape.y += yinc / 2;
    return shape;
  }

  /** return width, height; suitable for makeBox() => drawRect()  */
  protected override boxSize(text: Text): { width: number; height: number } {
    const width = text.getMeasuredWidth();
    const height = text.getMeasuredLineHeight();
    const high = height * 1.1;                   // change from ellispe margins
    const wide = Math.max(width * 1.1, high);    // change from ellispe margins
    return { width: wide, height: high };
  }
}

/** NoZeroCounter: Display '' when value is numerically 0 */
export class NoZeroCounter extends NumCounter {
  protected override setBoxWithValue(value: number): void {
    super.setBoxWithValue(value || '');
  }
}

export class DecimalCounter extends NumCounterBox {
  decimal = 0;
  constructor(name: string, initValue?: number, color?: string, fontSize?: number, fontName?: string) {
    super(name, initValue, color, fontSize, fontName);
  }

  override setBoxWithValue(value: number): void {
    super.setBoxWithValue(value.toFixed(this.decimal));
  }
}
