export function toLargestFileSizeUnit(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    // Find the exponent index for the units array
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    // Calculate the value in that unit and format to 2 decimal places
    const value = parseFloat((bytes / Math.pow(k, i)).toFixed(2));

    return `${value} ${sizes[i]}`;
}