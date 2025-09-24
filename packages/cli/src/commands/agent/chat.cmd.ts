import { Agent, Chat, TLLMEvent, TAgentMode } from '@smythos/sdk';
import chalk from 'chalk';
import readline from 'readline';
import logUpdate from 'log-update';
import { SRE } from '@smythos/sre';
import { EmitUnit, PluginBase, TokenLoom, PluginAPI } from 'tokenloom';

export default async function runChat(args: any, flags: any) {
    const sreConfigs: any = {};
    if (flags.vault) {
        sreConfigs.Vault = {
            Connector: 'JSONFileVault',
            Settings: {
                file: flags.vault,
            },
        };
    }
    if (flags.models) {
        sreConfigs.ModelsProvider = {
            Connector: 'JSONModelsProvider',
            Settings: {
                models: flags.models,
                mode: 'merge',
            },
        };
    }
    SRE.init(sreConfigs);
    await SRE.ready();
    const agentPath = args.path;
    const model = flags.chat === 'DEFAULT_MODEL' ? 'gpt-4o' : flags.chat;
    const mode = flags.mode === 'planner' ? TAgentMode.PLANNER : TAgentMode.DEFAULT;

    const agent = Agent.import(agentPath, { model, mode });
    
    const isPlanner = mode === TAgentMode.PLANNER;
    
    if (isPlanner) {
        console.clear();
        updateStickyTasksPanel();
        console.log(chalk.green('🚀 Smyth Agent is ready in Planner mode!'));
        console.log(chalk.yellow('The agent will create and manage tasks automatically.'));
        console.log(chalk.gray('Tasks will appear in the panel on the right →'));
        console.log(chalk.gray('Type "exit" or "quit" to end the conversation.'));
        console.log(''); // Empty line
        
        // Simple displayTasksList now that currentTasks is global
        const displayTasksList = (tasksList: any) => {
            currentTasks = tasksList || {};
            updateStickyTasksPanel();
        };
        
        // Set up task event listeners
        agent.on('TasksAdded', (tasksList: any, tasks: any) => {
            displayTasksList(tasks);
        });
        agent.on('SubTasksAdded', (taskId: string, subTasksList: any, tasks: any) => {
            displayTasksList(tasks);
        });
        agent.on('TasksUpdated', (taskId: string, status: string, tasks: any) => {
            displayTasksList(tasks);
        });
        agent.on('TasksCompleted', (tasks: any) => {
            displayTasksList(tasks);
        });
        agent.on('StatusUpdated', (status: string) => {
            console.log(chalk.gray('>>> ' + status));
        });
    } else {
    console.log(chalk.white('\nYou are now chatting with agent : ') + chalk.bold.green(agent.data?.name));
    console.log(chalk.white('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    }
    
    const chat = agent.chat();

    // Create readline interface for user input
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.blue('\n\n You: '),
    });

    // Set up readline event handlers
        rl.on('line', (input) => handleUserInput(input, rl, chat, isPlanner));

    rl.on('close', () => {
        console.log(chalk.gray('Chat session ended.'));
        process.exit(0);
    });

    // Redraw panel on terminal resize (planner mode only)
    if (isPlanner) {
        process.stdout.on('resize', () => {
            displayTasksList(currentTasks);
        });
    }

    // Start the interactive chat
    rl.prompt();
}

// Global variable to store current tasks across function calls
let currentTasks: any = {};

function updateStickyTasksPanel() {
    if (!currentTasks || Object.keys(currentTasks).length === 0) return;

    const terminalWidth = process.stdout.columns || 80;
    const panelWidth = 40;
    const panelHeight = 30;
    const panelStartCol = terminalWidth - panelWidth;

    // Save cursor position
    process.stdout.write('\u001b[s');

    // Clear the panel area first
    for (let row = 1; row <= panelHeight; row++) {
        process.stdout.write(`\u001b[${row};${panelStartCol}H`);
        process.stdout.write(' '.repeat(panelWidth));
    }

    let currentRow = 1;

    // Draw panel border and title
    process.stdout.write(`\u001b[${currentRow};${panelStartCol}H`);
    process.stdout.write(chalk.cyan('┌─ 📋 Tasks ') + chalk.cyan('─'.repeat(panelWidth - 13)) + chalk.cyan('┐'));
    currentRow++;

    // Display tasks
    Object.entries(currentTasks).forEach(([taskId, task]: [string, any]) => {
        if (currentRow >= panelHeight - 3) return;

        const summary = task.summary || task.description || 'No description';
        const status = task.status || 'planned';

        let statusColor: (text: string) => string = chalk.white;
        let icon = '';

        switch (status.toLowerCase()) {
            case 'completed':
            case 'done':
                statusColor = chalk.green;
                icon = '✅';
                break;
            case 'ongoing':
            case 'in progress':
                statusColor = chalk.yellow;
                icon = '⏳';
                break;
            case 'failed':
            case 'error':
                statusColor = chalk.red;
                icon = '❌';
                break;
            case 'planned':
            default:
                statusColor = chalk.blue;
                icon = '📝';
                break;
        }

        // Status line
        process.stdout.write(`\u001b[${currentRow};${panelStartCol}H`);
        process.stdout.write(chalk.cyan('│') + ' ');
        process.stdout.write(`${icon} ${statusColor(status.toUpperCase())}`);
        process.stdout.write(`\u001b[${currentRow};${panelStartCol + panelWidth - 1}H`);
        process.stdout.write(chalk.cyan('│'));
        currentRow++;

        // Summary lines with word wrapping
        const maxSummaryLength = panelWidth - 5;
        const wrappedSummary = wrapText(summary, maxSummaryLength);

        for (const line of wrappedSummary) {
            if (currentRow >= panelHeight - 3) break;

            process.stdout.write(`\u001b[${currentRow};${panelStartCol}H`);
            process.stdout.write(chalk.cyan('│') + '  ');
            process.stdout.write(chalk.white(line));
            process.stdout.write(`\u001b[${currentRow};${panelStartCol + panelWidth - 1}H`);
            process.stdout.write(chalk.cyan('│'));
            currentRow++;
        }
    });

    // Fill remaining rows
    while (currentRow < panelHeight - 2) {
        process.stdout.write(`\u001b[${currentRow};${panelStartCol}H`);
        process.stdout.write(chalk.cyan('│'));
        process.stdout.write(`\u001b[${currentRow};${panelStartCol + panelWidth - 1}H`);
        process.stdout.write(chalk.cyan('│'));
        currentRow++;
    }

    // Bottom border
    process.stdout.write(`\u001b[${currentRow};${panelStartCol}H`);
    process.stdout.write(chalk.cyan('└') + chalk.cyan('─'.repeat(panelWidth - 2)) + chalk.cyan('┘'));

    // Restore cursor position
    process.stdout.write('\u001b[u');
}

// Helper function to wrap text to specified width
function wrapText(text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
        if ((currentLine + word).length <= maxWidth) {
            currentLine += (currentLine ? ' ' : '') + word;
        } else {
            if (currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                lines.push(word.substring(0, maxWidth - 3) + '...');
                currentLine = '';
            }
        }
    }
    if (currentLine) {
        lines.push(currentLine);
    }
    return lines;
}

// Function to handle user input and chat response - matches reference example exactly
async function handleUserInput(input: string, rl: readline.Interface, chat: Chat, isPlanner: boolean = false) {
    if (input.toLowerCase().trim() === 'exit' || input.toLowerCase().trim() === 'quit') {
        console.log(chalk.green('👋 Goodbye!'));
        rl.close();
        return;
    }

    if (input.trim() === '') {
        rl.prompt();
        return;
    }

    try {
        console.log(chalk.gray('Thinking...'));
        if (isPlanner) {
            // Update task panel for planner mode
            const displayTasksList = (tasksList: any) => {
                currentTasks = tasksList || {};
                updateStickyTasksPanel();
            };
            displayTasksList(currentTasks);
        }

        // Send message to the agent and get response
        const streamChat = await chat.prompt(input).stream();

        // Clear the current line and move to a new line for the response
        process.stdout.write('\r');

        // TokenLoom parser to handle streaming content - ALWAYS use this approach
        const parser = new TokenLoom({
            emitUnit: EmitUnit.Word,
            emitDelay: 5,
            tags: ['thinking', 'planning', 'code'],
        });

        // Add line wrapping plugin (wrap based on terminal width)
        const terminalWidth = process.stdout.columns || 80;
        const panelWidth = 40; // Same as in updateStickyTasksPanel
        const availableWidth = terminalWidth - panelWidth - 10;
        const wrapWidth = Math.max(50, availableWidth);
        parser.use(new LineWrapperPlugin(wrapWidth));

        let assistantPrefixed = false;
        const printAssistantPrefixOnce = () => {
            if (!assistantPrefixed) {
                process.stdout.write(chalk.green('🤖 Assistant: '));
                assistantPrefixed = true;
            }
        };

        // Timing trackers
        const tagStartTime: Record<string, number> = {};
        let fenceStartTime: number | null = null;

        const special_tags = ['thinking', 'code', 'planning'];
        const content_color = {
            thinking: chalk.gray,
            planning: chalk.green,
            code: chalk.cyan,
        };

        // Tag events
        parser.on('tag-open', (event: any) => {
            printAssistantPrefixOnce();
            const name = (event.name || '').toLowerCase();
            process.stdout.write(chalk.gray(`<${name}>`));
            tagStartTime[name] = Date.now();
        });

        parser.on('tag-close', (event: any) => {
            printAssistantPrefixOnce();
            const name = (event.name || '').toLowerCase();
            process.stdout.write(chalk.gray(`</${name}>`));
            const duration = tagStartTime[name] ? Date.now() - tagStartTime[name] : 0;
            delete tagStartTime[name];
            console.log(chalk.blue(`\n[${name}] Took ${duration}ms`));
        });

        // Code fence events
        parser.on('code-fence-start', (event: any) => {
            printAssistantPrefixOnce();
            const info = event.info ? String(event.info) : event.lang ? String(event.lang) : '';
            process.stdout.write(chalk.gray(`\n\`\`\`${info}\n`));
            fenceStartTime = Date.now();
        });

        parser.on('code-fence-chunk', (event: any) => {
            printAssistantPrefixOnce();
            process.stdout.write(chalk.cyan(event.text || ''));
        });

        parser.on('code-fence-end', () => {
            printAssistantPrefixOnce();
            process.stdout.write(chalk.gray(`\n\`\`\`\n`));
            const duration = fenceStartTime ? Date.now() - fenceStartTime : 0;
            fenceStartTime = null;
            console.log(chalk.blue(`\n[code Block] Took: ${duration}ms`));
        });

        // Plain text tokens
        parser.on('text', (event: any) => {
            printAssistantPrefixOnce();
            const inTagName = event?.in?.inTag?.name ? String(event.in.inTag.name).toLowerCase() : null;
            if (inTagName && special_tags.includes(inTagName)) {
                const color = (content_color as any)[inTagName] || chalk.gray;
                process.stdout.write(color(event.text || ''));
            } else {
                process.stdout.write(chalk.white(event.text || ''));
            }
            // Only update tasks panel in planner mode
            if (isPlanner) {
                const displayTasksList = (tasksList: any) => {
                    currentTasks = tasksList || {};
                    updateStickyTasksPanel();
                };
                displayTasksList(currentTasks);
            }
        });

        streamChat.on(TLLMEvent.Data, (data) => {
            //console.log(chalk.gray('DATA  = ' + JSON.stringify(data)));
        });

        streamChat.on(TLLMEvent.Content, (content) => {
            if (isPlanner) {
                const displayTasksList = (tasksList: any) => {
                    currentTasks = tasksList || {};
                    updateStickyTasksPanel();
                };
                displayTasksList(currentTasks);
            }
            parser.feed({ text: content });
        });

        streamChat.on(TLLMEvent.End, () => {
            parser.flush();
            if (isPlanner) {
                const displayTasksList = (tasksList: any) => {
                    currentTasks = tasksList || {};
                    updateStickyTasksPanel();
                };
                displayTasksList(currentTasks);
            }
            //wait for the parser to flush
            parser.once('buffer-released', () => {
                console.log('\n\n');
            rl.prompt();
            });
        });

        streamChat.on(TLLMEvent.Error, (error) => {
            console.error(chalk.red('❌ Error:', error));
            rl.prompt();
        });

        const toolCalls = {};

        streamChat.on(TLLMEvent.ToolCall, (toolCall) => {
            if (toolCall?.tool?.name.startsWith('_sre_')) {
                return;
            }

            //make sure to not print tool info in the middle of a stream output
            parser.once('buffer-released', (event) => {
                const args =
                    typeof toolCall?.tool?.arguments === 'object'
                        ? Object.keys(toolCall?.tool?.arguments).map((key) => `${key}: ${toolCall?.tool?.arguments[key]}`)
                        : toolCall?.tool?.arguments;
                console.log(chalk.gray('\n[Calling Tool]'), chalk.gray(toolCall?.tool?.name), chalk.gray(args));
                toolCalls[toolCall?.tool?.id] = { startTime: Date.now() };
            });

            if (isPlanner) {
                const displayTasksList = (tasksList: any) => {
                    currentTasks = tasksList || {};
                    updateStickyTasksPanel();
                };
                displayTasksList(currentTasks);
            }
        });

        streamChat.on(TLLMEvent.ToolResult, (toolResult) => {
            if (toolResult?.tool?.name.startsWith('_sre_')) {
                if (isPlanner) {
                    console.log('\n');
                    const displayTasksList = (tasksList: any) => {
                        currentTasks = tasksList || {};
                        updateStickyTasksPanel();
                    };
                    displayTasksList(currentTasks);
                }
                return;
            }

            //make sure to not print tool info in the middle of a stream output
            parser.once('buffer-released', (event) => {
                console.log(chalk.gray(toolResult?.tool?.name), chalk.gray(`Took: ${Date.now() - toolCalls[toolResult?.tool?.id].startTime}ms`));
                delete toolCalls[toolResult?.tool?.id];
            });
            
            if (isPlanner) {
                const displayTasksList = (tasksList: any) => {
                    currentTasks = tasksList || {};
                    updateStickyTasksPanel();
                };
                displayTasksList(currentTasks);
            }
        });
    } catch (error) {
        console.error(chalk.red('❌ Error:', error));
        rl.prompt();
    }
}

//Token loom line wrapping plugin
export class LineWrapperPlugin extends PluginBase {
    name = 'line-wrapper';
    private charsSinceNewline = 0;
    private maxLineLength: number;
    private needsWrap = false;

    constructor(maxLineLength: number = 80) {
        super();
        this.maxLineLength = maxLineLength;
    }

    transform(event: any, api: PluginAPI): any | any[] | null {
        // Only process text events and code fence chunks
        if (event.type !== 'text' && event.type !== 'code-fence-chunk') {
            return event;
        }

        const text = event.text;
        let result = '';

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (char === '\n') {
                // Reset counter on newline
                this.charsSinceNewline = 0;
                this.needsWrap = false;
                result += char;
            } else if (this.needsWrap && (char === ' ' || char === '\t')) {
                // We've hit our limit and found a space/tab, replace with newline
                result += '\n';
                this.charsSinceNewline = 0;
                this.needsWrap = false;
            } else {
                // Regular character
                result += char;
                this.charsSinceNewline++;

                // Check if we've exceeded the limit
                if (this.charsSinceNewline >= this.maxLineLength) {
                    this.needsWrap = true;
                }
            }
        }

        // Return the modified event
        return {
            ...event,
            text: result,
        };
    }

    onInit?(api: PluginAPI): void {
        // Reset state when parser initializes
        this.charsSinceNewline = 0;
        this.needsWrap = false;
    }

    onDispose?(): void {
        // Clean up state when plugin is disposed
        this.charsSinceNewline = 0;
        this.needsWrap = false;
    }
}

