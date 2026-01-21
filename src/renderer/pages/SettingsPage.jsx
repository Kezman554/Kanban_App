import React, { useState } from 'react';
import { testPromptGenerator } from '../services/promptGenerator.js';

function SettingsPage() {
  const [testStatus, setTestStatus] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleTestPromptGenerator = async () => {
    setIsLoading(true);
    setTestStatus('running');
    setTestResult(null);

    try {
      const result = await testPromptGenerator();
      setTestResult(result);
      setTestStatus(result.success ? 'success' : 'error');
    } catch (error) {
      setTestResult({ error: error.message });
      setTestStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>

      {/* API Configuration Section */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-dark-text-primary">API Configuration</h2>
        <div className="bg-dark-card rounded-lg p-4 border border-dark-border">
          <p className="text-dark-text-secondary mb-4">
            Configure your Anthropic API key in the <code className="bg-dark-bg px-2 py-1 rounded text-sm">.env</code> file:
          </p>
          <pre className="bg-dark-bg p-3 rounded text-sm text-dark-text-secondary overflow-x-auto">
            ANTHROPIC_API_KEY=your_key_here
          </pre>
        </div>
      </section>

      {/* Prompt Generator Test Section */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-dark-text-primary">Prompt Generator Test</h2>
        <div className="bg-dark-card rounded-lg p-4 border border-dark-border">
          <p className="text-dark-text-secondary mb-4">
            Test the prompt generator service with sample card data.
          </p>

          <button
            onClick={handleTestPromptGenerator}
            disabled={isLoading}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              isLoading
                ? 'bg-dark-border text-dark-text-secondary cursor-not-allowed'
                : 'bg-accent-blue hover:bg-blue-500 text-white'
            }`}
          >
            {isLoading ? 'Testing...' : 'Run Test'}
          </button>

          {testStatus && (
            <div className="mt-4">
              <div className={`flex items-center gap-2 mb-2 ${
                testStatus === 'success' ? 'text-accent-green' :
                testStatus === 'error' ? 'text-accent-red' :
                'text-accent-yellow'
              }`}>
                <span className="text-lg">
                  {testStatus === 'success' ? '✓' :
                   testStatus === 'error' ? '✗' : '⏳'}
                </span>
                <span className="font-medium">
                  {testStatus === 'success' ? 'Test Passed' :
                   testStatus === 'error' ? 'Test Failed' : 'Running...'}
                </span>
              </div>

              {testResult && (
                <div className="bg-dark-bg rounded p-3 max-h-96 overflow-auto">
                  {testResult.success ? (
                    <div className="space-y-3 text-sm">
                      <div>
                        <span className="text-dark-text-secondary">Prompt:</span>
                        <pre className="mt-1 text-dark-text-primary whitespace-pre-wrap">{testResult.prompt}</pre>
                      </div>
                      <div>
                        <span className="text-dark-text-secondary">Checkpoint:</span>
                        <pre className="mt-1 text-dark-text-primary whitespace-pre-wrap">{testResult.checkpoint}</pre>
                      </div>
                      <div>
                        <span className="text-dark-text-secondary">Commit Message:</span>
                        <pre className="mt-1 text-dark-text-primary">{testResult.commitMessage}</pre>
                      </div>
                      {testResult.usage && (
                        <div className="text-dark-text-secondary text-xs mt-2">
                          Tokens: {testResult.usage.input_tokens} input, {testResult.usage.output_tokens} output
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-accent-red">
                      <span className="font-medium">Error:</span> {testResult.error}
                      {testResult.errorType && (
                        <span className="text-dark-text-secondary ml-2">({testResult.errorType})</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Placeholder for future settings */}
      <section>
        <h2 className="text-xl font-semibold mb-4 text-dark-text-primary">More Settings</h2>
        <p className="text-dark-text-secondary">
          Additional settings coming soon...
        </p>
      </section>
    </div>
  );
}

export default SettingsPage;
