import { Agent, Chat, TLLMEvent, TAgentMode } from '@smythos/sdk';
import chalk from 'chalk';
import readline from 'readline';
import logUpdate from 'log-update';
import { SRE } from '@smythos/sre';
import { EmitUnit, PluginBase, TokenLoom } from 'tokenloom';

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
    let currentTasks: any = {};
    
    if (isPlanner) {
        console.clear();
        console.log(chalk.green('🚀 Smyth Agent is ready in Planner mode!'));
        console.log(chalk.yellow('The agent will create and manage tasks automatically.'));
        console.log(chalk.gray('Tasks will appear in the panel on the right →'));
        console.log(chalk.gray('Type "exit" or "quit" to end the conversation.'));
        console.log(''); // Empty line
        
        // Set up task event listeners
        agent.on('TasksAdded', (tasksList: any, tasks: any) => {
            currentTasks = tasks || {};
            updateStickyTasksPanel();
        });
        agent.on('SubTasksAdded', (taskId: string, subTasksList: any, tasks: any) => {
            currentTasks = tasks || {};
            updateStickyTasksPanel();
        });
        agent.on('TasksUpdated', (taskId: string, status: string, tasks: any) => {
            currentTasks = tasks || {};
            updateStickyTasksPanel();
        });
        agent.on('TasksCompleted', (tasks: any) => {
            currentTasks = tasks || {};
            updateStickyTasksPanel();
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
    rl.on('line', (input) => handleUserInput(input, rl, chat, isPlanner, currentTasks));

    rl.on('close', () => {
        console.log(chalk.gray('Chat session ended.'));
        process.exit(0);
    });

    // Redraw panel on terminal resize (planner mode only)
    if (isPlanner) {
        process.stdout.on('resize', () => {
            updateStickyTasksPanel();
        });
    }

    // Start the interactive chat
    rl.prompt();
}

// Global variable to store current tasks across function calls
let globalCurrentTasks: any = {};

function updateStickyTasksPanel() {
    if (!globalCurrentTasks || Object.keys(globalCurrentTasks).length === 0) return;

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
    Object.entries(globalCurrentTasks).forEach(([taskId, task]: [string, any]) => {
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

// Function to handle user input and chat response
async function handleUserInput(input: string, rl: readline.Interface, chat: Chat, isPlanner: boolean = false, currentTasks: any = {}) {
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
        // Update global tasks reference
        globalCurrentTasks = currentTasks;
        
        if (isPlanner) {
            console.log(chalk.gray('Thinking...'));
            updateStickyTasksPanel();
        } else {
            logUpdate(chalk.gray('Thinking...'));
        }

        const assistantName = chat.agentData.name || 'AI';
        // Send message to the agent and get response
        const streamChat = await chat.prompt(input).stream();

        let response = '';
        const gradientLength = 10;
        const gradient = [
            chalk.rgb(200, 255, 200),
            chalk.rgb(170, 255, 170),
            chalk.rgb(140, 240, 140),
            chalk.rgb(110, 225, 110),
            chalk.rgb(85, 221, 85),
            chalk.rgb(60, 200, 60),
            chalk.rgb(0, 187, 0),
            chalk.rgb(0, 153, 0),
            chalk.bold.rgb(0, 130, 0),
            chalk.bold.rgb(0, 119, 0),
        ];

        let typing = Promise.resolve();
        let streamingStarted = false;
        let toolCallMessages: string[] = [];

        const renderResponse = () => {
            const prefix = chalk.green(`\n🤖 ${assistantName}\n`);
            const nonGradientPart = response.slice(0, -gradientLength);
            const gradientPart = response.slice(-gradientLength);

            let coloredGradientPart = '';
            for (let j = 0; j < gradientPart.length; j++) {
                const colorIndex = gradient.length - gradientPart.length + j;
                const color = gradient[colorIndex] || chalk.white;
                coloredGradientPart += color(gradientPart[j]);
            }

            logUpdate(`${prefix}${chalk.white(nonGradientPart)}${coloredGradientPart}`);
        };

        streamChat.on(TLLMEvent.Content, (content) => {
            if (content.length === 0) return;

            if (!streamingStarted) {
                streamingStarted = true;
                toolCallMessages = []; // Clear tool messages
                response = ''; // Clear any previous state.
            }

            typing = typing.then(
                () =>
                    new Promise((resolve) => {
                        let i = 0;
                        const intervalId = setInterval(() => {
                            if (i >= content.length) {
                                clearInterval(intervalId);
                                resolve();
                                return;
                            }

                            response += content[i];
                            renderResponse();
                            i++;
                        }, 5); // 10ms interval for faster typing
                    })
            );
        });

        streamChat.on(TLLMEvent.End, async () => {
            await typing;
            if (streamingStarted) {
                // Final render with all white text
                logUpdate(chalk.green(`\n🤖 ${assistantName}\n`) + chalk.white(response));
            }
            logUpdate.done();
            rl.prompt();
        });

        streamChat.on(TLLMEvent.Error, async (error) => {
            await typing;
            logUpdate.clear();
            console.error(chalk.red('❌ Error:', error));
            rl.prompt();
        });

        streamChat.on(TLLMEvent.ToolCall, async (toolCall) => {
            await typing;

            const toolMessage = `${chalk.yellowBright('[Calling Tool]')} ${toolCall?.tool?.name} ${chalk.gray(
                typeof toolCall?.tool?.arguments === 'object' ? JSON.stringify(toolCall?.tool?.arguments) : toolCall?.tool?.arguments
            )}`;
            toolCallMessages.push(toolMessage);
            logUpdate(toolCallMessages.join('\n'));
        });

        streamChat.on(TLLMEvent.ToolResult, async () => {
            await typing;

            const thinkingMessage = chalk.gray('Thinking...');
            // If we're not already showing "Thinking...", replace previous messages with it.
            if (toolCallMessages.length !== 1 || toolCallMessages[0] !== thinkingMessage) {
                toolCallMessages = [thinkingMessage];
                logUpdate(toolCallMessages.join('\n'));
            }
        });
    } catch (error) {
        logUpdate.clear();
        console.error(chalk.red('❌ Error:', error));
        rl.prompt();
    }
}
