/**
 * A regex that matches characters that are not allowed in filenames on Windows.
 * This is the most restrictive set, ensuring cross-platform compatibility.
 * Includes: < > : " / \ | ? * and control characters (0-31 and 127).
 */
const ILEGAL_CHARACTERS_REGEX = /[<>:"/\\|?*\x00-\x1f\x7f]/g;

/**
 * A regex that matches reserved filenames on Windows (case-insensitive).
 * These are forbidden entirely, with or without an extension.
 */
const RESERVED_FILENAMES_REGEX = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Sanitizes a string to be a valid filename. It replaces illegal characters
 * and handles Windows-specific reserved names and edge cases. This function
 * is designed to be safe for multilingual input.
 *
 * @param name The string to sanitize.
 * @param options An optional options object.
 * @param options.replacement The character to use for replacing illegal characters. Defaults to an empty string (removal).
 * @returns A safe filename string.
 */
export function sanitizeFilename(
    name: string,
    options?: { replacement?: string }
): string {
    const replacement = options?.replacement ?? '';

    // 1. Replace all illegal characters with the replacement string.
    let sanitized = name.replace(ILEGAL_CHARACTERS_REGEX, replacement);

    // 2. On Windows, names cannot end with a period or space.
    // We trim them to be safe across all platforms.
    sanitized = sanitized.trim().replace(/[. ]+$/, '');

    // 3. Check for reserved filenames. If a match is found, prepend an underscore.
    // e.g., "con.txt" becomes "_con.txt"
    const baseName = sanitized.split('.')[0];
    if (RESERVED_FILENAMES_REGEX.test(baseName || '')) {
        sanitized = '_' + sanitized;
    }

    // 4. A filename cannot be empty or just dots.
    if (sanitized === '' || /^\.+$/.test(sanitized)) {
        return '_'; // Return a default safe name
    }

    // Optional: Truncate to a reasonable length, e.g., 255 characters
    // const MAX_LENGTH = 255;
    // if (sanitized.length > MAX_LENGTH) {
    //   sanitized = sanitized.substring(0, MAX_LENGTH);
    // }

    return sanitized;
}

/**
 * Checks if a given string is a valid and safe filename across platforms.
 * It's stricter than sanitizeFilename; it checks if the string is *already* clean.
 *
 * @param name The string to validate.
 * @returns `true` if the filename is valid, `false` otherwise.
 */
export function isValidFilename(name: string): boolean {
    if (name.length === 0) {
        return false;
    }

    // If sanitizing the name changes it, it wasn't valid in the first place.
    // We pass an "X" as replacement to catch cases where illegal characters
    // would be removed, changing the string.
    const sanitizedName = sanitizeFilename(name, { replacement: 'X' });
    if (name !== sanitizedName) {
        // This check is a shortcut. If sanitizeFilename had to change anything
        // (replace an illegal char, trim space/dot), then it's not valid.
        return false;
    }

    // The shortcut above doesn't catch reserved names because sanitizeFilename *prepends*
    // an underscore rather than replacing. So we must test for it explicitly.
    const baseName = name.split('.')[0];
    return !(!baseName || RESERVED_FILENAMES_REGEX.test(baseName));
}

export function isImage(extension: PossiblyRef<string>) {
    return ['png', 'jpg', 'jpeg', 'webp'].includes(unref(extension))
}

export function isPlainTextFile(extension: PossiblyRef<string>) {
    return ['txt', 'md'].includes(unref(extension))
}

export function isLatexFile(extension: PossiblyRef<string>) {
    return ['tex'].includes(unref(extension))
}

export function isDataFile(extension: PossiblyRef<string>) {
    return ['base', 'yml', 'yaml', 'csv'].includes(unref(extension))
}

export function isYamlFile(extension: PossiblyRef<string>) {
    return ['yml', 'yaml'].includes(unref(extension))
}

export function isBasesFile(extension: PossiblyRef<string>) {
    return ['base'].includes(unref(extension))
}

export function isPdf(extension: PossiblyRef<string>) {
    return ['pdf'].includes(unref(extension))
}

export function isVideo(extension: PossiblyRef<string>) {
    return ['mp4', 'mov', 'mkv'].includes(unref(extension))
}

export function isUnreadableAsText(extension: PossiblyRef<string>) {
    return isImage(extension) || isPdf(extension) || isVideo(extension)
}

export function getFileExtensionFromPath(path: PossiblyRef<string>) {
    const fn = unref(path).split('.')
    return fn[fn.length - 1] || 'unknown'
}