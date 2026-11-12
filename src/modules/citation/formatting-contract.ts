import type {CitationFormatting} from "./formatting.ts";
export type CitationMap = Record<string, Array<{properties?:{plainCitation?:string}}> | unknown>;
export type IndexMap = Record<string, unknown>;
export type IdData = Record<string,{plainCitation?:string}>;
export type NativeSession = {citationsByItemID:CitationMap;citationsByIndex:IndexMap;styleClass?:string;updateFromDocument(n:number):Promise<void>};
type Collection = {id:number;key:string;name:string;libraryID:number;eraseTx():Promise<void>};
type Session = {closing?:boolean;_renameTask?:Promise<void>|null;collection?:Collection;idData?:IdData};
export type FormatContext = CitationFormatting & {
 _listenerStopped:boolean; _collectionsEnabled?:boolean; activeSessionID?:string|null; sessions:Record<string,Session>;_refreshRetryTimerBySession:Record<string,number>;
 _initializationTasks:Map<string,Promise<unknown>>;_sessionUpdateQueue:Record<string,Promise<void>>;_sessionUpdateRevision:Record<string,number>;
 _tagSyncTimerBySession:Record<string,number>;_pendingTagSyncIDsBySession:Record<string,number[]>;_sessionCitedIDs:Record<string,number[]>;_tagSyncInFlightBySession:Record<string,Promise<unknown>>;_temporaryCollectionKeys:Set<string>;
 _activeRefreshTasks:Set<Promise<void>>;_emptyReadCountBySession:Record<string,number>;_sortedCacheBySession:Record<string,unknown>;
 _refreshStateBySession:WeakMap<object,{syncing?:boolean;pending?:boolean}>;_lastRefreshAt:Record<string,number>;_minRefreshInterval:number;
 _lastRefreshFingerprintBySession?:WeakMap<object,string>;_lastSyncFailedBySession?:WeakMap<object,boolean>;_pendingItemsViewRefreshIDs?:Set<number>|"full"|null;
 _itemsViewRefreshTimer:number|null;_itemsViewRefreshDebounceMs:number;
 logError(message:string,error:unknown):void;syncCitationTags(id:string,ids:number[]):Promise<unknown>;cleanupSessionState(id:string,clear:boolean):void;_saveKeySet(key:string,values:Set<string>):void;
 _getSortedCacheKey(id:string):string; scheduleCitationTagSync(id:string,ids:number[],force?:boolean):void;getSortedItemIDs(index:IndexMap,id:string):number[];_hasOnlyTrashedCitationItems(index:IndexMap):boolean;
 _recordPerf(name:string,ms:number):void;_parseValidItemID(id:string):number|null;syncCollectionItems(s:Session,ids:number[]):Promise<boolean|void>;_invalidateSessionIndex():void;_noteListenerActivity?():void;
};
