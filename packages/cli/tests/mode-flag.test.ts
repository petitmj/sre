/**
 * Tests for --mode flag functionality
 */

import { expect, test, describe } from '@jest/globals';
import { runCommand } from '@oclif/test';

describe('CLI Mode Flag', () => {
    test('help should show --mode flag with options', async () => {
        const { stdout } = await runCommand(['agent', '--help']);
        
        expect(stdout).toContain('--mode=<mode>');
        expect(stdout).toContain('Set the agent execution mode');
        expect(stdout).toContain('--mode planner');
    });

    test('should accept valid mode values', async () => {
        // Test with default mode
        const { error: defaultError } = await runCommand([
            'agent', 'tests/data/crypto-assistant.smyth', 
            '--mode', 'default', 
            '--help'
        ]);
        expect(defaultError).toBeUndefined();

        // Test with planner mode  
        const { error: plannerError } = await runCommand([
            'agent', 'tests/data/crypto-assistant.smyth',
            '--mode', 'planner',
            '--help'
        ]);
        expect(plannerError).toBeUndefined();
    });

    test('should reject invalid mode values', async () => {
        const { error } = await runCommand([
            'agent', 'tests/data/crypto-assistant.smyth',
            '--mode', 'invalid-mode',
            '--help'
        ]);
        
        expect(error?.message).toContain('Expected --mode=invalid-mode to be one of: default, planner');
    });

    test('should default to default mode when not specified', async () => {
        const { stdout } = await runCommand([
            'agent', 'tests/data/crypto-assistant.smyth',
            '--help'
        ]);
        
        // Should not error and should show help
        expect(stdout).toContain('Run .smyth agent');
    });
});
