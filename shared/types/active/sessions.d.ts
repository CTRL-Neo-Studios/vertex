export interface ActiveSession {
    uuid: string,
    workspaceSession: boolean,
    rootPath?: string,
}

export interface ActiveWindowSession {
    uuid: string
}