export interface EmbedOrLink {
    embed: boolean;
    path: string;
    subpath?: string;
    alias?: string;
}

/**
 * Get all links and embeds as a flat array with their positions
 */
export interface LinkWithPosition extends EmbedOrLink {
    start: number;
    end: number;
    fullMatch: string;
}