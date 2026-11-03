import type {Component} from "vue";
import type {ViewerId} from "~/utils/viewers";
import RichText from "~/components/ViewerEditor/RichText.vue";
import ImageViewer from "~/components/ViewerEditor/ImageViewer.vue";
import BasesViewer from "~/components/ViewerEditor/BasesViewer.vue";
import WorkflowViewer from "~/components/ViewerEditor/WorkflowViewer.vue";
import YamlDataForm from "~/components/ViewerEditor/YamlDataForm.vue";
import LatexDoc from "~/components/ViewerEditor/LatexDoc.vue";
import CodeText from "~/components/ViewerEditor/CodeText.vue";

/** Viewer id → component. Static imports so the bundler includes every viewer (no runtime name lookup). */
export const viewerComponents: Record<ViewerId, Component> = {
    markdown: RichText,
    image: ImageViewer,
    bases: BasesViewer,
    workflow: WorkflowViewer,
    yaml: YamlDataForm,
    latex: LatexDoc,
    code: CodeText,
}
