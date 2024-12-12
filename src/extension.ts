import * as vscode from 'vscode';
import OpenAI from 'openai';
import * as path from 'path';
import * as fs from 'fs';

interface BlogMetadata {
    description: string;
    categories: string[];
    tags: string[];
}

const LANGUAGE_PROMPTS = {
    english: {
        description: "a brief description",
        categories: "categories",
        tags: "tags",
        prompt: (maxLength: number, maxCategories: number, maxTags: number) =>
            `Please analyze the following blog content and generate:
1. A brief description (maximum ${maxLength} characters)
2. ${maxCategories} relevant categories
3. ${maxTags} relevant tags

Please return in the following JSON format:
{
    "description": "brief description text",
    "categories": ["category1", "category2", ...],
    "tags": ["tag1", "tag2", ...]
}

Blog content:`
    },
    chinese: {
        description: "简短描述",
        categories: "分类",
        tags: "标签",
        prompt: (maxLength: number, maxCategories: number, maxTags: number) =>
            `请分析以下博客内容并生成：
1. 一个简短的描述（不超过${maxLength}个字符）
2. ${maxCategories}个相关的分类
3. ${maxTags}个相关的标签

请按照以下JSON格式返回：
{
    "description": "描述文本",
    "categories": ["分类1", "分类2", ...],
    "tags": ["标签1", "标签2", ...]
}

博客内容：`
    },
    japanese: {
        description: "簡単な説明",
        categories: "カテゴリー",
        tags: "タグ",
        prompt: (maxLength: number, maxCategories: number, maxTags: number) =>
            `以下のブログコンテンツを分析し、生成してください：
1. 簡単な説明（最大${maxLength}文字）
2. ${maxCategories}個の関連カテゴリー
3. ${maxTags}個の関連タグ

以下のJSON形式で返してください：
{
    "description": "説明文",
    "categories": ["カテゴリー1", "カテゴリー2", ...],
    "tags": ["タグ1", "タグ2", ...]
}

ブログ内容：`
    }
};

// 计算所需的最大 token 数量
// 考虑到：1. 提示词长度 2. 描述长度 3. 分类和标签数量 4. JSON 格式开销 5. 安全余量
function calculateRequiredTokens(maxLength: number, maxCategories: number, maxTags: number, language: keyof typeof LANGUAGE_PROMPTS): number {
    // 估算每个字符平均需要的 token 数（保守估计）
    const charsPerToken = 2.5;

    // 计算提示词的 token（保守估计）
    const promptTokens = 200;  // 基础提示词长度

    // 计算响应所需的 token
    const descriptionTokens = Math.ceil(maxLength / charsPerToken);  // 描述
    const categoryTokens = maxCategories * 15;  // 每个分类平均 15 个 token（包括引号和逗号）
    const tagTokens = maxTags * 10;  // 每个标签平均 10 个 token（包括引号和逗号）
    const jsonOverheadTokens = 50;  // JSON 格式的额外开销

    // 添加 50% 的安全余量，确保不会截断
    const totalTokens = Math.ceil((promptTokens + descriptionTokens + categoryTokens + tagTokens + jsonOverheadTokens) * 1.5);

    // 返回至少 500 个 token，确保基本功能正常
    return Math.max(500, totalTokens);
}

// 清理 AI 返回的结果，移除可能的 Markdown 代码块标记
function cleanAIResponse(response: string): string {
    // 移除开头的 ```json 或 ``` 标记
    response = response.replace(/^```(?:json)?\s*/i, '');
    // 移除结尾的 ``` 标记
    response = response.replace(/\s*```\s*$/i, '');
    // 移除任何剩余的 Markdown 代码块标记
    response = response.replace(/```/g, '');
    return response.trim();
}

async function generateBlogMetadata(content: string, apiKey: string, baseURL: string, model: string, language: keyof typeof LANGUAGE_PROMPTS, maxLength: number, maxCategories: number, maxTags: number): Promise<BlogMetadata> {
    try {
        const openai = new OpenAI({
            apiKey: apiKey,
            baseURL: baseURL,
        });

        const prompt = LANGUAGE_PROMPTS[language].prompt(maxLength, maxCategories, maxTags) + '\n' + content;

        const maxTokens = calculateRequiredTokens(maxLength, maxCategories, maxTags, language);

        const response = await openai.chat.completions.create({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
            temperature: 0.7,
        });

        const result = response.choices[0]?.message?.content?.trim() || '';
        try {
            const cleanedResult = cleanAIResponse(result);
            return JSON.parse(cleanedResult);
        } catch (e) {
            console.error('Raw response:', result);
            console.error('Cleaned response:', cleanAIResponse(result));
            throw new Error('Failed to parse model response: ' + e + '\n\nRaw response:\n' + result);
        }
    } catch (error) {
        console.error('Error generating metadata:', error);
        if (error instanceof Error) {
            throw new Error(`API call failed: ${error.message}`);
        }
        throw error;
    }
}

interface ParsedFileName {
    date?: string;
    title: string;
    isValidFormat: boolean;
}

function parseFileName(fileName: string): ParsedFileName {
    // Remove .md extension
    const nameWithoutExt = fileName.replace(/\.md$/, '');

    // Try to match date format yyyy-MM-dd-title
    const dateRegex = /^(\d{4}-\d{2}-\d{2})-(.+)$/;
    const match = nameWithoutExt.match(dateRegex);

    if (match) {
        return {
            date: match[1],
            title: match[2],
            isValidFormat: true
        };
    }

    return {
        title: nameWithoutExt,
        isValidFormat: false
    };
}

async function renameFile(oldPath: string, newFileName: string): Promise<{ success: boolean, document?: vscode.TextDocument }> {
    try {
        const dirPath = path.dirname(oldPath);
        const newPath = path.join(dirPath, newFileName);

        // Check if target filename already exists
        if (fs.existsSync(newPath)) {
            throw new Error('Target filename already exists');
        }

        // Close all editors with the old file
        await Promise.all(
            vscode.window.visibleTextEditors
                .filter(editor => editor.document.fileName === oldPath)
                .map(editor => vscode.window.showTextDocument(editor.document, editor.viewColumn)
                    .then(() => vscode.commands.executeCommand('workbench.action.closeActiveEditor')))
        );

        // Rename file
        fs.renameSync(oldPath, newPath);

        // Open the new file
        const document = await vscode.workspace.openTextDocument(newPath);
        await vscode.window.showTextDocument(document);

        return { success: true, document };
    } catch (error) {
        console.error('Error renaming file:', error);
        vscode.window.showErrorMessage('Failed to rename file: ' + (error as Error).message);
        return { success: false };
    }
}

function removeExistingHeader(document: vscode.TextDocument): { text: string, range?: vscode.Range } {
    const text = document.getText();

    // Check if document starts with YAML header
    const headerRegex = /^---\n[\s\S]+?\n---\n\n/;
    const match = text.match(headerRegex);

    if (match) {
        // If header found, return remaining text and range to delete
        const endPosition = document.positionAt(match[0].length);
        return {
            text: text.slice(match[0].length),
            range: new vscode.Range(new vscode.Position(0, 0), endPosition)
        };
    }

    // If no header found, return original text
    return { text };
}

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('markdown-header-autogen.generateHeader', async () => {
        // Get current active text editor
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        // Check if file is Markdown
        if (!editor.document.fileName.toLowerCase().endsWith('.md')) {
            vscode.window.showErrorMessage('This is not a Markdown file');
            return;
        }

        // Get configuration
        const config = vscode.workspace.getConfiguration('markdown-header-autogen');
        const author = config.get<string>('author') || '';
        const apiKey = config.get<string>('openai.apiKey');
        const baseURL = config.get<string>('openai.baseURL') || 'https://api.openai.com/v1';
        const model = config.get<string>('openai.model') || 'gpt-3.5-turbo';
        const language = config.get<keyof typeof LANGUAGE_PROMPTS>('language') || 'english';
        const maxLength = config.get<number>('description.maxLength') || 50;
        const maxCategories = config.get<number>('categories.maxCount') || 3;
        const maxTags = config.get<number>('tags.maxCount') || 5;

        if (!apiKey) {
            vscode.window.showErrorMessage('Please configure OpenAI API Key in settings');
            return;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Generating Header...",
                cancellable: false
            }, async (progress) => {
                if (!editor) {
                    throw new Error('No active editor found');
                }

                // Parse filename
                progress.report({ increment: 0, message: "Analyzing file..." });
                const fileName = path.basename(editor.document.fileName);
                const { date, title, isValidFormat } = parseFileName(fileName);

                // Store the content before any operations
                const { text: contentWithoutHeader, range: headerRange } = removeExistingHeader(editor.document);

                // If filename format is incorrect, prompt user to modify
                if (!isValidFormat) {
                    progress.report({ increment: 20, message: "Checking filename format..." });
                    const currentDate = new Date().toISOString().split('T')[0];
                    const suggestedFileName = `${currentDate}-${title}.md`;

                    const choice = await vscode.window.showWarningMessage(
                        `It is recommended to rename the file to "${suggestedFileName}" format for proper blog display.`,
                        'Confirm Rename',
                        'Ignore'
                    );

                    if (choice === 'Confirm Rename') {
                        progress.report({ increment: 20, message: "Renaming file..." });
                        const { success, document } = await renameFile(editor.document.fileName, suggestedFileName);
                        if (!success) {
                            return;
                        }
                        // Update editor reference to the new document
                        const newEditor = vscode.window.activeTextEditor;
                        if (!newEditor || !document) {
                            vscode.window.showErrorMessage('Failed to open renamed file');
                            return;
                        }
                        editor = newEditor;
                        vscode.window.showInformationMessage('File renamed successfully!');
                    }
                } else {
                    progress.report({ increment: 40, message: "Filename format is correct" });
                }

                // Generate blog metadata
                progress.report({ increment: 40, message: "Generating metadata with AI..." });
                const metadata = await generateBlogMetadata(
                    contentWithoutHeader,
                    apiKey,
                    baseURL,
                    model,
                    language,
                    maxLength,
                    maxCategories,
                    maxTags
                );

                // Create header
                progress.report({ increment: 10, message: "Creating header..." });
                const header = [
                    '---',
                    `title: "${title}"`,
                    `date: ${date || new Date().toISOString().split('T')[0]}`,
                    `author: "${author}"`,
                    `description: "${metadata.description}"`,
                    `categories: ${JSON.stringify(metadata.categories)}`,
                    `tags: ${JSON.stringify(metadata.tags)}`,
                    '---\n\n'
                ].join('\n');

                // Insert new header at document start, delete old if exists
                progress.report({ increment: 10, message: "Updating document..." });
                if (!editor) {
                    throw new Error('Editor not available');
                }
                await editor.edit(editBuilder => {
                    if (headerRange) {
                        editBuilder.delete(headerRange);
                    }
                    editBuilder.insert(new vscode.Position(0, 0), header);
                });
            });

            vscode.window.showInformationMessage('Header generated successfully!');
        } catch (error) {
            vscode.window.showErrorMessage('Error generating metadata: ' + (error as Error).message);
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() { }
