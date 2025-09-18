import nlp from 'compromise';

export function useWriterTools(content: PossiblyRef<string>) {
    const nlpInstance = nlp(unref(content))

    function getNlp() {
        return nlpInstance
    }
}