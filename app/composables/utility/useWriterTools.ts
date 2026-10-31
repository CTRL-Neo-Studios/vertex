import nlp from 'compromise';

export function useWriterTools(content: PossiblyRef<string>) {
    return nlp(unref(content))
}