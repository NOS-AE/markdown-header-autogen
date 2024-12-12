# Markdown Header AutoGen

AI-powered YAML header generator for Markdown blog posts.

## Features

- Automatically generates YAML header for your Markdown blog posts
- AI-powered description, categories, and tags generation
- Supports multiple languages (English, Chinese, Japanese)
- Customizable settings for description length and metadata counts
- Enforces consistent filename format (yyyy-MM-dd-title.md)
- Smart file renaming suggestions

## Requirements

- VSCode 1.85.0 or higher
- OpenAI API key

## Extension Settings

This extension contributes the following settings:

* `markdown-header-autogen.author`: Default author name
* `markdown-header-autogen.openai.apiKey`: OpenAI API key
* `markdown-header-autogen.openai.baseURL`: Base URL for OpenAI API (default: https://api.openai.com/v1)
* `markdown-header-autogen.openai.model`: OpenAI model to use (gpt-3.5-turbo or gpt-4)
* `markdown-header-autogen.language`: Language for generated content (english, chinese, japanese)
* `markdown-header-autogen.description.maxLength`: Maximum length of generated descriptions
* `markdown-header-autogen.categories.maxCount`: Maximum number of categories to generate
* `markdown-header-autogen.tags.maxCount`: Maximum number of tags to generate

## Usage

1. Open a Markdown file
2. Run the "Generate Markdown Header" command
3. If needed, confirm file renaming to match the required format
4. Wait for the AI to generate the metadata
5. The header will be automatically inserted at the top of your file

## Example Output

```yaml
---
title: "My Blog Post"
date: 2024-12-12
author: "Your Name"
description: "A comprehensive guide to TypeScript decorators"
categories: ["Programming", "TypeScript", "Web Development"]
tags: ["typescript", "decorators", "javascript", "web", "tutorial"]
---
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
