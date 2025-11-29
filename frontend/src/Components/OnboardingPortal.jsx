import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Globe, 
  Lock, 
  Zap, 
  Check, 
  ChevronRight, 
  Upload, 
  AlertCircle,
  Loader2,
  Play,
  MessageSquare,
  Send,
  Code2,
  Shield,
  Database,
  Key,
  FileText
} from 'lucide-react';

// Backend API base URL
const API_BASE_URL = 'http://localhost:5000';

const OnboardingPortal = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState([]);
  
  // Step 1: Knowledge Base State
  const [knowledgeMode, setKnowledgeMode] = useState('url'); // 'url' or 'file'
  const [apiUrl, setApiUrl] = useState('');
  const [baseUrlOverride, setBaseUrlOverride] = useState(''); // Optional base URL override
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [trainingStage, setTrainingStage] = useState('');
  
  // Step 2: Access Control State
  const [authEnabled, setAuthEnabled] = useState(false);
  const [selectedAuthType, setSelectedAuthType] = useState('oauth2');
  const [authConfig, setAuthConfig] = useState({
    oauth2: { clientId: '', clientSecret: '', authUrl: '', tokenUrl: '' },
    apiKey: { keyName: '', keyValue: '', location: 'header' },
    bearer: { token: '' },
    basic: { username: '', password: '' },
    custom: { headerName: '', headerValue: '' }
  });
  
  // Step 3: Verify State
  const [learnedSkills, setLearnedSkills] = useState([]);
  const [knowledgeBaseId, setKnowledgeBaseId] = useState(null); // Track current knowledge base
  const [chatMessages, setChatMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isBotTyping, setIsBotTyping] = useState(false);

  const steps = [
    { number: 1, title: 'Setup & Authentication', icon: Database },
    { number: 2, title: 'Verify Agent', icon: Zap }
  ];

  const authTypes = [
    { id: 'oauth2', name: 'OAuth 2.0', icon: Lock, description: 'Industry standard' },
    { id: 'apiKey', name: 'API Key', icon: Key, description: 'Simple & secure' },
    { id: 'bearer', name: 'Bearer Token', icon: Shield, description: 'Token-based' },
    { id: 'basic', name: 'Basic Auth', icon: FileText, description: 'Username/Password' },
    { id: 'custom', name: 'Custom Header', icon: Code2, description: 'Flexible' }
  ];

  // Real API: Train Agent and Save Auth Config
  const handleTrainAgent = async () => {
    setIsTraining(true);
    setTrainingProgress(0);
    
    try {
      // Stage 1: Save authentication config first
      setTrainingStage('Saving authentication config...');
      setTrainingProgress(10);
      
      const authPayload = {
        authEnabled,
        authType: authEnabled ? selectedAuthType : null,
        config: authEnabled ? authConfig[selectedAuthType] : null
      };
      
      await axios.post(`${API_BASE_URL}/api/auth/configure`, authPayload);
      console.log('✅ Auth configuration saved');
      
      // Stage 2: Fetching OpenAPI spec
      setTrainingStage('Fetching OpenAPI Spec...');
      setTrainingProgress(30);
      
      // Prepare payload based on mode
      let payload;
      if (knowledgeMode === 'url') {
        payload = {
          sourceType: 'url',
          sourceUrl: apiUrl,
          baseUrlOverride: baseUrlOverride || null
        };
      } else {
        // Read file content
        const fileContent = await uploadedFile.text();
        payload = {
          sourceType: 'file',
          fileContent: fileContent,
          fileName: uploadedFile.name,
          baseUrlOverride: baseUrlOverride || null
        };
      }
      
      setTrainingProgress(50);
      setTrainingStage('Validating Schema...');
      
      // Call real backend API
      const response = await axios.post(`${API_BASE_URL}/api/knowledge/ingest`, payload);
      console.log("first response formbackend: ", response);
      setTrainingProgress(80);
      setTrainingStage('Generating Vector Embeddings...');
      
      await new Promise(resolve => setTimeout(resolve, 800));
      setTrainingProgress(100);
      
      // Extract learned skills and knowledge base ID from response
      if (response.data.success && response.data.data.skills) {
        console.log("skills: ", response.data.data);
        setLearnedSkills(response.data.data.skills);
        setKnowledgeBaseId(response.data.data.knowledgeBaseId); // Store for agent queries
      }
      
      console.log('✅ Knowledge ingestion successful:', response.data);
      
      setIsTraining(false);
      setCompletedSteps([...completedSteps, 1]);
      
      // Initialize chat
      setChatMessages([
        { 
          role: 'bot', 
          content: 'Hello! I\'m your AI agent. I\'ve learned your API endpoints. Try asking me to perform an action!',
          timestamp: new Date()
        }
      ]);
      
      setTimeout(() => setCurrentStep(2), 500);
      
    } catch (error) {
      console.error('❌ Setup failed:', error);
      setTrainingStage('Error: ' + (error.response?.data?.message || error.message));
      setIsTraining(false);
      
      // Show error to user
      alert('Failed to complete setup: ' + (error.response?.data?.message || error.message));
    }
  };

  // This function is no longer needed - auth is handled in handleTrainAgent

  // Real API: Execute Agent Query
  const handleSendMessage = async () => {
    if (!userInput.trim()) return;
    
    const currentQuery = userInput;
    const userMessage = { role: 'user', content: currentQuery, timestamp: new Date() };
    setChatMessages([...chatMessages, userMessage]);
    setUserInput('');
    setIsBotTyping(true);

    try {
      // Call real backend API
      const response = await axios.post(`${API_BASE_URL}/api/agent/execute`, {
        userQuery: currentQuery,
        knowledgeBaseId: knowledgeBaseId // Pass the knowledge base ID
      });
      
      if (response.data.success) {
        const { matchedEndpoint, toolCall, response: apiResponse, naturalResponse } = response.data.data;
        
        // Show tool call
        const toolCallMessage = {
          role: 'tool',
          method: toolCall.method,
          endpoint: toolCall.endpoint,
          status: 'running'
        };
        setChatMessages(prev => [...prev, toolCallMessage]);
        
        // Wait a bit for visual effect
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Show bot response
        const botResponse = {
          role: 'bot',
          content: naturalResponse || `I executed ${toolCall.method} ${toolCall.endpoint}. Here's the response:`,
          data: apiResponse,
          timestamp: new Date()
        };
        
        setChatMessages(prev => [...prev, botResponse]);
        console.log('✅ Agent execution successful:', response.data);
      }
      
    } catch (error) {
      console.error('❌ Agent execution failed:', error);
      
      // Show error message
      const errorMessage = {
        role: 'bot',
        content: 'Sorry, I encountered an error: ' + (error.response?.data?.message || error.message),
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsBotTyping(false);
    }
  };

  const getMethodColor = (method) => {
    const colors = {
      GET: 'bg-blue-50 text-blue-700 border-blue-200',
      POST: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      PUT: 'bg-amber-50 text-amber-700 border-amber-200',
      DELETE: 'bg-rose-50 text-rose-700 border-rose-200'
    };
    return colors[method] || 'bg-gray-50 text-gray-700 border-gray-200';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">BotBuilder</h1>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-sm font-medium">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            System Operational
          </div>
        </div>
      </header>

      {/* Stepper */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-16">
          {steps.map((step, index) => (
            <React.Fragment key={step.number}>
              <div className="flex flex-col items-center gap-3 relative">
                <div className={`
                  w-12 h-12 rounded-full flex items-center justify-center font-semibold text-sm
                  transition-all duration-300 border-2
                  ${completedSteps.includes(step.number) 
                    ? 'bg-indigo-600 border-indigo-600 text-white' 
                    : currentStep === step.number
                    ? 'bg-indigo-50 border-indigo-600 text-indigo-600'
                    : 'bg-white border-gray-200 text-gray-400'
                  }
                `}>
                  {completedSteps.includes(step.number) ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    step.number
                  )}
                </div>
                <div className="text-center">
                  <div className={`text-sm font-semibold ${
                    currentStep === step.number ? 'text-slate-900' : 'text-slate-500'
                  }`}>
                    {step.title}
                  </div>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-4 transition-all duration-300 ${
                  completedSteps.includes(step.number) ? 'bg-indigo-600' : 'bg-gray-200'
                }`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Knowledge Base + Authentication */}
        {currentStep === 1 && (
          <div className="max-w-3xl mx-auto">
            <div className="bg-white rounded-xl border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Setup & Authentication</h2>
                <p className="text-slate-500">Connect your API documentation and configure authentication</p>
              </div>

              {/* Toggle Mode */}
              <div className="flex gap-2 p-1 bg-gray-50 rounded-lg mb-6">
                <button
                  onClick={() => setKnowledgeMode('url')}
                  className={`flex-1 py-2.5 px-4 rounded-md font-medium text-sm transition-all ${
                    knowledgeMode === 'url'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Globe className="w-4 h-4 inline mr-2" />
                  URL Import
                </button>
                <button
                  onClick={() => setKnowledgeMode('file')}
                  className={`flex-1 py-2.5 px-4 rounded-md font-medium text-sm transition-all ${
                    knowledgeMode === 'file'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Upload className="w-4 h-4 inline mr-2" />
                  File Upload
                </button>
              </div>

              {/* URL Input */}
              {knowledgeMode === 'url' && (
                <>
                <div className="mb-6">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">
                    OpenAPI Specification URL
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="url"
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      placeholder="https://api.example.com/openapi.json"
                      className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all"
                    />
                  </div>
                </div>

                
                <div className="mb-6">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">
                    Base URL Override (Optional)
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="url"
                      value={baseUrlOverride}
                      onChange={(e) => setBaseUrlOverride(e.target.value)}
                      placeholder="https://staging.myapi.com (leave empty to use spec default)"
                      className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all"
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    💡 Override the base URL from the OpenAPI spec (useful for staging/local testing)
                  </p>
                </div>
                </>
              )}

              {/* File Upload */}
               {knowledgeMode === 'file' && (
                <div className="mb-6">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">
                    Upload OpenAPI File
                  </label>
                  <input
                    type="file"
                    accept=".json,.yaml,.yml"
                    onChange={(e) => setUploadedFile(e.target.files[0])}
                    className="hidden"
                    id="file-upload"
                  />
                  <label 
                    htmlFor="file-upload" 
                    className="block border-2 border-dashed border-gray-200 rounded-lg p-8 text-center hover:border-indigo-300 transition-all cursor-pointer"
                  >
                    <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                    {uploadedFile ? (
                      <div>
                        <p className="text-sm font-medium text-slate-900 mb-1">{uploadedFile.name}</p>
                        <p className="text-xs text-slate-500">Click to change file</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-slate-900 mb-1">Drop file or click to browse</p>
                        <p className="text-xs text-slate-500">Supports JSON, YAML formats</p>
                      </>
                    )}
                  </label>
                </div>
              )}

              {/* Authentication Section - Only show for URL mode */}
              {knowledgeMode === 'url' && (
                <div className="mb-6 p-6 bg-gray-50/50 rounded-lg border border-gray-200">
                  <h3 className="text-sm font-semibold text-slate-500 uppercase mb-4">API Authentication (Optional)</h3>
                  
                  {/* Master Toggle */}
                  <div className="flex items-center justify-between p-4 bg-white rounded-lg mb-4">
                    <div>
                      <h4 className="font-semibold text-slate-900">Enable Authentication</h4>
                      <p className="text-sm text-slate-500">Required if your API spec URL needs auth</p>
                    </div>
                    <button
                      onClick={() => setAuthEnabled(!authEnabled)}
                      className={`relative w-14 h-7 rounded-full transition-all ${
                        authEnabled ? 'bg-indigo-600' : 'bg-gray-300'
                      }`}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform ${
                        authEnabled ? 'translate-x-7' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>

                  {authEnabled && (
                    <>
                      {/* Auth Type Grid */}
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        {authTypes.map((type) => {
                          const Icon = type.icon;
                          return (
                            <button
                              key={type.id}
                              onClick={() => setSelectedAuthType(type.id)}
                              className={`p-3 rounded-lg border-2 transition-all text-left ${
                                selectedAuthType === type.id
                                  ? 'bg-indigo-50 border-indigo-600'
                                  : 'bg-white border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <Icon className={`w-4 h-4 mb-1 ${
                                selectedAuthType === type.id ? 'text-indigo-600' : 'text-slate-400'
                              }`} />
                              <div className={`font-semibold text-xs mb-0.5 ${
                                selectedAuthType === type.id ? 'text-indigo-900' : 'text-slate-900'
                              }`}>
                                {type.name}
                              </div>
                              <div className="text-xs text-slate-500">{type.description}</div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Configuration Form */}
                      <div className="p-4 bg-white rounded-lg border border-gray-200">
                        {selectedAuthType === 'apiKey' && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Key Name</label>
                              <input
                                type="text"
                                value={authConfig.apiKey.keyName}
                                onChange={(e) => setAuthConfig({
                                  ...authConfig,
                                  apiKey: { ...authConfig.apiKey, keyName: e.target.value }
                                })}
                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                                placeholder="X-API-Key"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Key Value</label>
                              <input
                                type="password"
                                value={authConfig.apiKey.keyValue}
                                onChange={(e) => setAuthConfig({
                                  ...authConfig,
                                  apiKey: { ...authConfig.apiKey, keyValue: e.target.value }
                                })}
                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                                placeholder="••••••••"
                              />
                            </div>
                          </div>
                        )}

                        {selectedAuthType === 'bearer' && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Bearer Token</label>
                            <input
                              type="password"
                              value={authConfig.bearer.token}
                              onChange={(e) => setAuthConfig({
                                ...authConfig,
                                bearer: { token: e.target.value }
                              })}
                              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                            />
                          </div>
                        )}

                        {selectedAuthType === 'basic' && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Username</label>
                              <input
                                type="text"
                                value={authConfig.basic.username}
                                onChange={(e) => setAuthConfig({
                                  ...authConfig,
                                  basic: { ...authConfig.basic, username: e.target.value }
                                })}
                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                                placeholder="admin"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Password</label>
                              <input
                                type="password"
                                value={authConfig.basic.password}
                                onChange={(e) => setAuthConfig({
                                  ...authConfig,
                                  basic: { ...authConfig.basic, password: e.target.value }
                                })}
                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                                placeholder="••••••••"
                              />
                            </div>
                          </div>
                        )}

                        {selectedAuthType === 'oauth2' && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Client ID</label>
                              <input
                                type="text"
                                value={authConfig.oauth2.clientId}
                                onChange={(e) => setAuthConfig({
                                  ...authConfig,
                                  oauth2: { ...authConfig.oauth2, clientId: e.target.value }
                                })}
                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                                placeholder="your-client-id"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Client Secret</label>
                              <input
                                type="password"
                                value={authConfig.oauth2.clientSecret}
                                onChange={(e) => setAuthConfig({
                                  ...authConfig,
                                  oauth2: { ...authConfig.oauth2, clientSecret: e.target.value }
                                })}
                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                                placeholder="••••••••"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Auth URL</label>
                              <input
                                type="url"
                                value={authConfig.oauth2.authUrl}
                                onChange={(e) => setAuthConfig({
                                  ...authConfig,
                                  oauth2: { ...authConfig.oauth2, authUrl: e.target.value }
                                })}
                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                                placeholder="https://auth.example.com"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Token URL</label>
                              <input
                                type="url"
                                value={authConfig.oauth2.tokenUrl}
                                onChange={(e) => setAuthConfig({
                                  ...authConfig,
                                  oauth2: { ...authConfig.oauth2, tokenUrl: e.target.value }
                                })}
                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                                placeholder="https://token.example.com"
                              />
                            </div>
                          </div>
                        )}

                        {selectedAuthType === 'custom' && (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Header Name</label>
                              <input
                                type="text"
                                value={authConfig.custom.headerName}
                                onChange={(e) => setAuthConfig({
                                  ...authConfig,
                                  custom: { ...authConfig.custom, headerName: e.target.value }
                                })}
                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                                placeholder="X-Custom-Auth"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Header Value</label>
                              <input
                                type="password"
                                value={authConfig.custom.headerValue}
                                onChange={(e) => setAuthConfig({
                                  ...authConfig,
                                  custom: { ...authConfig.custom, headerValue: e.target.value }
                                })}
                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                                placeholder="••••••••"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Training Progress */}
              {isTraining && (
                <div className="mb-6 p-4 bg-indigo-50/50 border border-indigo-100 rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                    <span className="text-sm font-medium text-indigo-900">{trainingStage}</span>
                  </div>
                  <div className="w-full bg-indigo-100 rounded-full h-2 overflow-hidden">
                    <div 
                      className="h-full bg-indigo-600 transition-all duration-500 ease-out"
                      style={{ width: `${trainingProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Action Button */}
              <button
                onClick={handleTrainAgent}
                disabled={isTraining || (knowledgeMode === 'url' && !apiUrl) || (knowledgeMode === 'file' && !uploadedFile)}
                className="w-full py-3.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
              >
                {isTraining ? 'Setting up agent...' : 'Train Agent & Continue'}
              </button>
            </div>
          </div>
        )}


        {/* Step 2: Verify Agent */}
        {currentStep === 2 && (
          <div className="max-w-6xl mx-auto">
            <div className="bg-white rounded-xl border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Agent Simulator</h2>
                <p className="text-slate-500">Test your AI agent in real-time</p>
              </div>

              <div className="grid grid-cols-12 divide-x divide-gray-200">
                {/* Sidebar: Learned Skills */}
                <div className="col-span-4 p-6 bg-gray-50/50">
                  <h3 className="text-sm font-semibold text-slate-500 uppercase mb-4 flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Learned Skills
                  </h3>
                  <div className="space-y-2">
                    {learnedSkills.map((skill, index) => (
                      <div
                        key={index}
                        className="p-3 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getMethodColor(skill.method)}`}>
                            {skill.method}
                          </span>
                          <code className="text-xs font-mono text-slate-700 group-hover:text-indigo-600 transition-colors">
                            {skill.endpoint}
                          </code>
                        </div>
                        <p className="text-xs text-slate-500">{skill.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Chat Window */}
                <div className="col-span-8 flex flex-col h-[600px]">
                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-4">
                    {chatMessages.map((message, index) => (
                      <div key={index}>
                        {message.role === 'user' && (
                          <div className="flex justify-end">
                            <div className="max-w-[70%] bg-indigo-600 text-white px-4 py-3 rounded-lg shadow-sm">
                              <p className="text-sm">{message.content}</p>
                            </div>
                          </div>
                        )}
                        
                        {message.role === 'bot' && (
                          <div className="flex justify-start">
                            <div className="max-w-[70%] bg-white border border-gray-200 px-4 py-3 rounded-lg shadow-sm">
                              <p className="text-sm text-slate-900 mb-2">{message.content}</p>
                              {message.data && (
                                <div className="mt-2 p-3 bg-slate-50 rounded border border-slate-200">
                                  <pre className="text-xs font-mono text-slate-700 overflow-x-auto">
                                    {JSON.stringify(message.data, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {message.role === 'tool' && (
                          <div className="flex justify-center">
                            <div className="px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs font-mono text-amber-900 flex items-center gap-2">
                              <Play className="w-3 h-3" />
                              Running: <span className="font-bold">{message.method} {message.endpoint}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {isBotTyping && (
                      <div className="flex justify-start">
                        <div className="bg-white border border-gray-200 px-4 py-3 rounded-lg shadow-sm">
                          <div className="flex gap-1">
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Input */}
                  <div className="p-4 bg-white border-t border-gray-200">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Ask the agent to perform an action..."
                        className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all"
                        disabled={isBotTyping}
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!userInput.trim() || isBotTyping}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Complete Setup */}
              <div className="p-6 bg-gray-50 border-t border-gray-200">
                <button
                  onClick={() => {
                    setCompletedSteps([...completedSteps, 2]);
                    alert('🎉 Onboarding Complete! Your AI agent is ready to deploy.');
                  }}
                  className="w-full py-3.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                >
                  <Check className="w-5 h-5" />
                  Complete Setup & Deploy Agent
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingPortal;
