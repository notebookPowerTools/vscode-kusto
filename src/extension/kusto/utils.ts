import { Uri } from 'vscode';
import { DeepReadonly } from '../types';
import { EngineSchema } from './schema';

export function getClusterDisplayName(clusterUri: string | EngineSchema | DeepReadonly<EngineSchema>) {
    let uri = '';
    if (typeof clusterUri === 'string') {
        uri = clusterUri;
    } else {
        uri = clusterUri.cluster.connectionString;
    }
    return Uri.parse(uri).authority.split('.')[0];
}
