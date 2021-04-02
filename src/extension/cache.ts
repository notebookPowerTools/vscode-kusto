import { Memento } from 'vscode';

let globalMemento: Memento | undefined;
export function initializeCache(memento: Memento) {
    globalMemento = memento;
}

export async function updateCache<T>(key: string, value: T) {
    await globalMemento?.update(key, value);
}

export function getFromCache<T>(key: string, defaultValue?: T): T | undefined {
    return globalMemento?.get(key) || defaultValue;
}
