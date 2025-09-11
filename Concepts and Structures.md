# Concepts and Structures

## Two Modes, One App

The Editor has two main modes: Workspace Mode, and Singlespace Mode.

A Workspace is a folder that contains groups of markdown files and other types of files, which the editor will index everything in the folder and use that indexed information to enhance markdown editing features, i.e. internal links, embeds and etc.
Singlespace is when the Vertex editor is editing a single file without the context of all the files in a folder. Like Notepad, but Rich text editing with Markdown.

When the user opens a folder using Vertex, it automatically opens that folder in Workspace Mode.
When the user opens a file using Vertex, it automatically opens that folder in the Singlespace Mode.

Context is the core difference between a Workspace and a Singlespace/Single-File.

## Operating Flow

```mermaid
graph TD
    N_1[App Entry]
    
    subgraph S_1[Initialization Phase]
        S_1A1[Opening App]
        S_1A2[Getting Recent Data]
        S_1A3[Open New/Create New/etc.]
    end

    subgraph S_2[Indexing & Caching Phase]
        S_2A1[Index Files in Workspace]
        S_2A2[Cache Markdown Frontmatter Properties, Metadata, Backlinks, Forelinks, etc.]
        
        S_2A1 --> S_2A2
    end

    subgraph S_3[Read/Write Operations]
        S_3A1[Read, Write]
    end

    N_1 --> S_1
    S_1 --> S_2
    S_1 --> S_3
```
