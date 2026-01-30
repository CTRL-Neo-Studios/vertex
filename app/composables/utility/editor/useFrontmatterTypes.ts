import type {YamlFieldType} from "@type32/yaml-editor-form";
import {useInternalLinkParsing} from "~/composables/utility/editor/useInternalLinkParsing";

export function useFrontmatterTypes(): YamlFieldType[] {
    const parse = useInternalLinkParsing()
    return [
        {
            type: 'color',
            defaultValue: '#FFFFFF',
            component: 'color',
            baseType: 'string',
            icon: 'i-lucide-palette',
            label: 'Color',
            detect: (value) => typeof value === 'string' && /^#([A-Fa-f0-9]{3}){1,2}$|^#([A-Fa-f0-9]{4}){1,2}$/.test(value)
        },
        // disabled for now for some complicated issues
        // {
        //     type: 'embed',
        //     defaultValue: '',
        //     component: 'embed',
        //     baseType: 'string',
        //     icon: 'i-lucide-file',
        //     label: 'Embed',
        //     detect: (value) => typeof value === 'string' && parse.isEmbed(value)
        // }
    ]
}