import { EventDispatcher } from '@thegraid/easeljs-module';

/** drill down through value of inner fields. */
export function findFieldValue(obj: { [index: string]: any }, ...names: Array<string | Array<string>>): any {
  let next: any;
  const n = names.shift()
  if (!n) return obj;            // return obj when no more field accessors
  if (typeof(n) == 'string') {
    next = obj[n];
  } else {
    const nn = n.find(n => !!obj[n])
    next = !!nn ? obj[nn] : !!n[0] ? undefined : obj // [null, foo, bar] -> next = obj
  }
  return !!next ? findFieldValue(next, ... names) : undefined
}

/** Interface into RoboPlayer */
export interface Notifyable {
  notify(source: EventDispatcher, eventName: string, dwell?: number): void
  block(source?: EventDispatcher, eventName?: string, dwell?: number): void
}
