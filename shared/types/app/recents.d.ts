export interface RecentRecord {
    fullPath: string,
    name: string,
    lastOpened: Date,
    isWorkspace: boolean
}

export interface AppRecents {
    recentRecords: RecentRecord[]
}