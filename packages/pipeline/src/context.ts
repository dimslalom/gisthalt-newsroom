import { getStore, withStore, type Store } from '@newsroom/db';
import { GeminiRouter } from '@newsroom/llm';
export interface Ctx { store: Store; router: GeminiRouter; now(): Date }
export const contextFor = (store: Store): Ctx => ({ store, router: new GeminiRouter(store), now: () => new Date() });
/** Only for single-process tests. Runtime entry points use withCtx. */
export const getCtx = (): Ctx => contextFor(getStore());
export const withCtx = <T>(fn: (ctx: Ctx) => T | Promise<T>): Promise<T> => withStore((store) => fn(contextFor(store)));
