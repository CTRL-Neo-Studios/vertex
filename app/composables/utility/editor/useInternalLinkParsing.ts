import type {EmbedOrLink, LinkWithPosition} from "#shared/types/editor/parsing";

export function useInternalLinkParsing() {

    /**
     * Parse markdown text for internal links and embeds in the format [[path#subpath|alias]]
     * Returns an array of all found links/embeds
     */
    function parseInternalLinks(text: string): EmbedOrLink[] {
        const results: EmbedOrLink[] = [];
        let i = 0;

        while (i < text.length) {
            // Check for "!" followed by "[["
            const isEmbed = text[i] === '!' && text[i + 1] === '[' && text[i + 2] === '[';
            // Check for "[["
            const isLink = !isEmbed && text[i] === '[' && text[i + 1] === '[';

            if (isEmbed || isLink) {
                const startPos = i;
                if (isEmbed) i++; // Skip the "!" for embeds

                i += 2; // Skip the initial "[["
                let linkStart = i;
                let bracketDepth = 0;

                // Find the closing "]]"
                while (i < text.length - 1) {
                    // Check for nested "[[" which is not allowed
                    if (text[i] === '[' && text[i + 1] === '[') {
                        break; // Invalid nested link
                    }

                    // Check for closing "]]"
                    if (text[i] === ']' && text[i + 1] === ']') {
                        const linkEnd = i;
                        i += 2; // Skip the closing "]]"

                        // Extract the content between [[ and ]]
                        const content = text.substring(linkStart, linkEnd);

                        // Parse the content
                        const parsed = parseLinkContent(content, isEmbed);
                        if (parsed) {
                            results.push(parsed);
                        }

                        break;
                    }

                    i++;
                }

                // If we didn't find closing "]]", continue from original position
                if (i >= text.length || text[i] !== ']') {
                    i = startPos + 1;
                }
            } else {
                i++;
            }
        }

        return results;
    }

    /**
     * Parse the content inside [[...]]
     */
    function parseLinkContent(content: string, isEmbed: boolean): EmbedOrLink | null {
        // Check for empty link
        if (!content.trim()) {
            return null;
        }

        const result: EmbedOrLink = {
            embed: isEmbed,
            path: '',
        };

        // Split by pipe to separate path and alias
        const pipeIndex = content.indexOf('|');

        let pathPart = content;
        let aliasPart = '';

        if (pipeIndex !== -1) {
            pathPart = content.substring(0, pipeIndex).trim();
            aliasPart = content.substring(pipeIndex + 1).trim();

            if (aliasPart) {
                result.alias = aliasPart;
            }
        }

        // Split path by # to separate main path and subpath
        const hashIndex = pathPart.indexOf('#');

        if (hashIndex !== -1) {
            result.path = pathPart.substring(0, hashIndex).trim();
            const subpath = pathPart.substring(hashIndex + 1).trim();

            if (subpath) {
                result.subpath = subpath;
            } else {
                // Handle case where there's just a # with no subpath
                result.subpath = '';
            }
        } else {
            result.path = pathPart.trim();
        }

        // If path is empty after trimming (e.g., [[ |alias]] or [[#|alias]])
        if (!result.path && !result.subpath) {
            return null;
        }

        return result;
    }

    /**
     * Alternative: Parse a single link at a specific position
     * Useful for incremental parsing or cursor-based parsing
     */
    function parseLinkAtPosition(text: string, pos: number): EmbedOrLink | null {
        if (pos < 0 || pos >= text.length) {
            return null;
        }

        // Look backward for "!" or "[["
        let start = pos;
        while (start >= 0 && !(start <= text.length - 2 && text[start] === '[' && text[start + 1] === '[')) {
            start--;
        }

        if (start < 0 || text[start] !== '[' || text[start + 1] !== '[') {
            return null;
        }

        // Check if there's a "!" before the "[["
        const isEmbed = start > 0 && text[start - 1] === '!';
        const linkStart = isEmbed ? start - 1 : start;

        // Look forward for closing "]]"
        let end = start + 2;
        while (end < text.length - 1 && !(text[end] === ']' && text[end + 1] === ']')) {
            // Disallow nested "[["
            if (text[end] === '[' && text[end + 1] === '[') {
                return null;
            }
            end++;
        }

        if (end >= text.length - 1 || text[end] !== ']' || text[end + 1] !== ']') {
            return null;
        }

        // Extract and parse the link
        const fullLink = text.substring(linkStart, end + 2);
        const content = text.substring(start + 2, end);

        return parseLinkContent(content, isEmbed);
    }



    function parseInternalLinksWithPositions(text: string): LinkWithPosition[] {
        const results: LinkWithPosition[] = [];
        let i = 0;

        while (i < text.length) {
            // Check for "!" followed by "[["
            const isEmbed = text[i] === '!' && text[i + 1] === '[' && text[i + 2] === '[';
            // Check for "[["
            const isLink = !isEmbed && text[i] === '[' && text[i + 1] === '[';

            if (isEmbed || isLink) {
                const startPos = i;
                const linkStart = i;

                if (isEmbed) i++; // Skip the "!" for embeds

                i += 2; // Skip the initial "[["
                let contentStart = i;
                let foundClose = false;

                // Find the closing "]]"
                while (i < text.length - 1) {
                    // Check for nested "[[" which is not allowed
                    if (text[i] === '[' && text[i + 1] === '[') {
                        break; // Invalid nested link
                    }

                    // Check for closing "]]"
                    if (text[i] === ']' && text[i + 1] === ']') {
                        const contentEnd = i;
                        const endPos = i + 2;

                        // Extract the content between [[ and ]]
                        const content = text.substring(contentStart, contentEnd);
                        const fullMatch = text.substring(startPos, endPos);

                        // Parse the content
                        const parsed = parseLinkContent(content, isEmbed);
                        if (parsed) {
                            results.push({
                                ...parsed,
                                start: startPos,
                                end: endPos,
                                fullMatch,
                            });
                        }

                        i = endPos;
                        foundClose = true;
                        break;
                    }

                    i++;
                }

                // If we didn't find closing "]]", continue from original position + 1
                if (!foundClose) {
                    i = startPos + 1;
                }
            } else {
                i++;
            }
        }

        return results;
    }

    /**
     * Check if a string is an internal link (without "!") in the format [[...]]
     * This checks if the string is EXACTLY a link, not if it contains a link
     */
    function isInternalLink(str: string): boolean {
        // Must start with "[["
        if (!str.startsWith('[[')) return false;

        // Must end with "]]"
        if (!str.endsWith(']]')) return false;

        // Must be at least 4 characters ("[[]]")
        if (str.length < 4) return false;

        // Extract content inside brackets
        const content = str.substring(2, str.length - 2);

        // Check for empty content
        if (!content.trim()) return false;

        // Check for nested "[" inside (invalid)
        if (content.includes('[[')) return false;

        // Check if it starts with "!" (would be an embed)
        if (str.startsWith('!')) return false;

        return true;
    }

    /**
     * Check if a string is an embed (starts with "!") in the format ![[...]]
     * This checks if the string is EXACTLY an embed, not if it contains an embed
     */
    function isEmbed(str: string): boolean {
        // Must start with "![[" and end with "]]"
        if (!str.startsWith('![') || !str.endsWith(']]')) return false;

        // Check that the third character is "["
        if (str.length < 5 || str[2] !== '[') return false;

        // Extract content inside brackets (excluding the leading "!")
        const content = str.substring(3, str.length - 2);

        // Check for empty content
        if (!content.trim()) return false;

        // Check for nested "[" inside (invalid)
        if (content.includes('[[')) return false;

        return true;
    }

    /**
     * Check if a string is either an internal link or embed
     * This checks if the string is EXACTLY a link or embed
     */
    function isInternalLinkOrEmbed(str: string): boolean {
        return isInternalLink(str) || isEmbed(str);
    }

    /**
     * Check if a string contains an internal link or embed anywhere within it
     * Returns true if the string contains at least one valid link/embed
     */
    function containsInternalLinkOrEmbed(str: string): boolean {
        return parseInternalLinks(str).length > 0;
    }

    /**
     * Check if a string starts with an internal link or embed
     * Useful for quick prefix checking
     */
    function startsWithInternalLinkOrEmbed(str: string): boolean {
        // Quick checks for common patterns
        if (str.startsWith('[[')) {
            // Find the closing "]]"
            const closeIndex = str.indexOf(']]');
            if (closeIndex === -1) return false;

            // Check if everything from start to closeIndex+2 is a valid link
            const potentialLink = str.substring(0, closeIndex + 2);
            return isInternalLink(potentialLink);
        }

        if (str.startsWith('![')) {
            // Find the closing "]]"
            const closeIndex = str.indexOf(']]');
            if (closeIndex === -1) return false;

            // Check if everything from start to closeIndex+2 is a valid embed
            const potentialEmbed = str.substring(0, closeIndex + 2);
            return isEmbed(potentialEmbed);
        }

        return false;
    }

    /**
     * Extract the first internal link or embed from a string
     * Returns the full matched string or null if none found
     */
    function extractFirstInternalLinkOrEmbed(str: string): string | null {
        // Quick implementation using the existing parser
        const links = parseInternalLinksWithPositions(str);
        return links.length > 0 ? links[0]?.fullMatch ?? null : null;
    }

    /**
     * Check if a character at a given position in a string could be the start of an internal link or embed
     * Useful for real-time parsing as user types
     */
    function isAtLinkStart(str: string, pos: number): boolean {
        if (pos < 0 || pos >= str.length) return false;

        // Check for "[["
        if (str[pos] === '[' && pos + 1 < str.length && str[pos + 1] === '[') {
            return true;
        }

        // Check for "![["
        if (str[pos] === '!' &&
            pos + 2 < str.length &&
            str[pos + 1] === '[' &&
            str[pos + 2] === '[') {
            return true;
        }

        return false;
    }

    /**
     * Check if a character at a given position in a string is inside an internal link or embed
     * Returns the link data if inside, null otherwise
     */
    function isInsideLink(str: string, pos: number): EmbedOrLink | null {
        const links = parseInternalLinksWithPositions(str);

        for (const link of links) {
            if (pos >= link.start && pos < link.end) {
                return {
                    embed: link.embed,
                    path: link.path,
                    subpath: link.subpath,
                    alias: link.alias
                };
            }
        }

        return null;
    }

    return {
        parseInternalLinks,
        parseLinkContent,
        parseLinkAtPosition,
        parseInternalLinksWithPositions,
        isAtLinkStart,
        isEmbed,
        isInsideLink,
        isInternalLinkOrEmbed,
        isInternalLink,
        containsInternalLinkOrEmbed,
        startsWithInternalLinkOrEmbed
    }
}