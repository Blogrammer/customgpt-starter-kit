/**
 * ChatContainer Component
 * 
 * Main chat interface component that manages the entire chat experience.
 * This is the primary component for integrating CustomGPT chat functionality.
 * 
 * Features:
 * - Message display with streaming support
 * - Agent selection and switching
 * - Citation handling with modal details
 * - Multiple deployment modes (standalone, widget, floating)
 * - Welcome screen with example prompts
 * - Error handling and authorization checks
 * 
 * For customization:
 * - Example questions are now fetched from agent settings API
 * - Modify DEFAULT_EXAMPLE_PROMPTS for fallback starter questions
 * - Customize WelcomeMessage for branding
 * - Adjust ChatHeader for different layouts
 * - Style using Tailwind classes throughout
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Bot } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import type { ChatMessage, Citation, Agent } from '@/types';
import { cn } from '@/lib/utils';
import { Message } from './Message';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';
import { AgentSelector } from './AgentSelector';
import { CitationDetailsModal } from './CitationDetailsModal';
import { CitationFilePreview } from './CitationFilePreview';
import { ConversationManager } from './ConversationManager';
import { MessageErrorDisplay } from './MessageErrorDisplay';
import { logger } from '@/lib/logger';
import { useWidgetSafe } from '@/widget/WidgetContext';
import { useMessageStore, useConversationStore, useAgentStore } from '@/hooks/useWidgetStore';
import { MessageSkeleton, LoadingOverlay } from '@/components/ui/loading';
import { getClient } from '@/lib/api/client';
import { VoiceModal } from '@/components/voice/VoiceModal';
import { useBreakpoint } from '@/hooks/useMediaQuery';
import { useDemoStore } from '@/store/demo';
import { FreeTrialLimitModal } from '@/components/demo/FreeTrialLimitModal';

/**
 * Default example prompts shown to users when starting a new conversation
 * These are used as fallback when API-sourced example questions are not available
 */
const DEFAULT_EXAMPLE_PROMPTS = [
  "What can you help me with?",
  "Explain this document", 
  "Summarize key points",
  "Answer my questions",
];

interface ExamplePromptCardProps {
  /** The prompt text to display */
  prompt: string;
  /** Handler called when the prompt is clicked */
  onClick: (prompt: string) => void;
}

/**
 * ExamplePromptCard Component
 * 
 * Clickable card showing an example prompt that users can select
 * to quickly start a conversation
 */
const ExamplePromptCard: React.FC<ExamplePromptCardProps> = ({ prompt, onClick }) => {
  return (
    <button
      onClick={() => onClick(prompt)}
      className={cn(
        "text-left bg-card border border-border rounded-lg",
        "hover:border-accent hover:shadow-sm transition-all",
        "text-card-foreground",
        "p-2.5",
        "text-xs",
        "min-h-[50px] flex items-center",
        "w-full" // Ensures button takes full width of grid cell
      )}
    >
      {prompt}
    </button>
  );
};

interface WelcomeMessageProps {
  /** Handler called when an example prompt is clicked */
  onPromptClick: (prompt: string) => void;
}

/**
 * WelcomeMessage Component
 * 
 * Displays a welcome screen when no messages exist in the conversation.
 * Shows the agent name, welcome text, and example prompts.
 * Fetches agent-specific example questions from API with fallback to defaults.
 * Uses Framer Motion for smooth animations.
 */
const WelcomeMessage: React.FC<WelcomeMessageProps> = ({ onPromptClick }) => {
  const { currentAgent } = useAgentStore();
  const [exampleQuestions, setExampleQuestions] = useState<string[]>(DEFAULT_EXAMPLE_PROMPTS);
  const [loading, setLoading] = useState(false);
  
  /**
   * Fetch agent settings to get custom example questions
   */
  useEffect(() => {
    const fetchExampleQuestions = async () => {
      if (!currentAgent) {
        return;
      }

      // If we already have example questions from settings, use them
      if (currentAgent.settings?.example_questions && currentAgent.settings.example_questions.length > 0) {
        setExampleQuestions(currentAgent.settings.example_questions);
        return;
      }

      setLoading(true);
      try {
        const client = getClient();
        const response = await client.getAgentSettings(currentAgent.id);
        const settings = response.data || response;
        
        // Use API example questions if available, otherwise keep defaults
        if (settings.example_questions && settings.example_questions.length > 0) {
          setExampleQuestions(settings.example_questions);
          
          logger.info('UI', 'Loaded custom example questions from API', {
            agentId: currentAgent.id,
            questionCount: settings.example_questions.length
          });
        } else {
          logger.info('UI', 'No custom example questions found, using defaults', {
            agentId: currentAgent.id
          });
        }
      } catch (error) {
        logger.warn('UI', 'Failed to load agent settings for example questions', {
          agentId: currentAgent.id,
          error: error instanceof Error ? error.message : String(error)
        });
        // Keep default questions on error
      } finally {
        setLoading(false);
      }
    };

    fetchExampleQuestions();
  }, [currentAgent]);
  
  return (
    <div className={cn(
      "flex flex-col items-center justify-center h-full py-8",
      "px-4 md:px-8"
    )}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={cn(
          "text-center w-full",
          "max-w-sm sm:max-w-md md:max-w-lg"
        )}
      >
        {/* Agent Avatar */}
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6 mx-auto overflow-hidden bg-accent">
          {currentAgent?.settings?.chatbot_avatar ? (
            <img 
              src={currentAgent.settings.chatbot_avatar} 
              alt={`${currentAgent.project_name} avatar`} 
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <Bot className="w-8 h-8 text-muted-foreground" />
          )}
        </div>
        
        {/* Welcome Text */}
        <h3 className={cn(
          "font-semibold text-foreground mb-2",
          "text-lg sm:text-xl md:text-2xl"
        )}>
          Welcome to {currentAgent?.project_name || 'CustomGPT'}!
        </h3>
        <p className={cn(
          "text-muted-foreground mb-6 sm:mb-8",
          "text-sm sm:text-base"
        )}>
          I&apos;m here to help answer your questions and assist with your tasks. How can I help you today?
        </p>
        
        {/* Example Prompts */}
        <div className={cn(
          "grid gap-2 sm:gap-3 w-full",
          "grid-cols-2",
          "max-w-full sm:max-w-md md:max-w-lg",
          "auto-cols-fr" // Ensures equal column widths
        )}>
          {exampleQuestions.map((prompt, idx) => (
            <motion.div
              key={`${currentAgent?.id}-${idx}`} // Include agent ID to force re-render on agent change
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 + (idx * 0.1) }}
            >
              <ExamplePromptCard
                prompt={prompt}
                onClick={onPromptClick}
              />
            </motion.div>
          ))}
        </div>
        
        {/* Loading indicator for example questions */}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4"
          >
            <p className="text-xs text-muted-foreground">Loading custom questions...</p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

interface MessageAreaProps {
  /** Additional CSS classes for styling */
  className?: string;
  /** Deployment mode - affects behavior */
  mode?: 'standalone' | 'widget' | 'floating';
  /** Function to show free trial limit modal */
  onShowFreeTrialLimitModal?: () => void;
}

/**
 * MessageArea Component
 * 
 * Scrollable area that displays all messages in the current conversation.
 * Handles:
 * - Message rendering with streaming support
 * - Auto-scrolling to latest messages
 * - Citation click handling
 * - Error display
 * - Welcome message when empty
 * - Loading states with typing indicator
 */
const MessageArea: React.FC<MessageAreaProps> = ({ className, mode = 'standalone', onShowFreeTrialLimitModal }) => {
  const { 
    messages, 
    streamingMessage, 
    isStreaming,
    error,
    sendMessage,
    updateMessageFeedback,
    loading,
    clearError,
    setMessagesForConversation
  } = useMessageStore();
  const { currentConversation } = useConversationStore();
  const { currentAgent } = useAgentStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isLoadingMessages, setIsLoadingMessages] = React.useState(false);
  const [prevConversationId, setPrevConversationId] = React.useState<string | null>(null);
  
  // Citation modal state - tracks which citation is being viewed
  const [selectedCitationId, setSelectedCitationId] = React.useState<number | string | null>(null);
  const [citationModalOpen, setCitationModalOpen] = React.useState(false);
  
  // Citation preview state
  const [previewCitationId, setPreviewCitationId] = React.useState<string | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = React.useState(false);
  
  // Check if we're in free trial mode by looking at localStorage
  const [isFreeTrialMode, setIsFreeTrialMode] = React.useState(false);
  
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const freeTrialFlag = localStorage.getItem('customgpt.freeTrialMode');
      setIsFreeTrialMode(freeTrialFlag === 'true');
    }
  }, []);
  
  const conversationMessages = currentConversation 
    ? messages.get(currentConversation.id.toString()) || []
    : [];
    
  // Debug logging for widget mode
  useEffect(() => {
    if (mode === 'widget' || mode === 'floating') {
      console.log('[ChatContainer] Widget conversation state:', {
        currentConversation: currentConversation,
        conversationId: currentConversation?.id,
        messageCount: conversationMessages.length,
        messagesMapSize: messages.size,
        messagesMapKeys: Array.from(messages.keys()),
        isLoadingMessages,
        loading
      });
    }
  }, [currentConversation, conversationMessages, mode, messages, isLoadingMessages, loading]);
  
  // Detect conversation change
  useEffect(() => {
    if (currentConversation && currentConversation.id.toString() !== prevConversationId) {
      setIsLoadingMessages(true);
      setPrevConversationId(currentConversation.id.toString());
      
      // Set a timeout to hide loading after a reasonable time
      const timeout = setTimeout(() => {
        setIsLoadingMessages(false);
      }, 1000);
      
      return () => clearTimeout(timeout);
    }
  }, [currentConversation, prevConversationId]);
  
  // Hide loading when messages arrive OR when message loading completes
  useEffect(() => {
    if (isLoadingMessages && (conversationMessages.length > 0 || !loading)) {
      setIsLoadingMessages(false);
    }
  }, [conversationMessages, isLoadingMessages, loading]);
  
  /**
   * Auto-scroll effect
   * Automatically scrolls to the bottom when new messages arrive
   * or when streaming messages are updated
   * 
   * Uses instant scroll for conversation switches to avoid annoying
   * scroll animations when clicking on past chats with many messages.
   * Uses smooth scroll for new messages and streaming updates.
   */
  useEffect(() => {
    if (scrollRef.current) {
      // Use instant scroll when loading messages (conversation switch)
      // Use smooth scroll for real-time message additions and streaming
      const scrollBehavior = isLoadingMessages ? 'auto' : 'smooth';
      
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: scrollBehavior,
      });
    }
  }, [conversationMessages, streamingMessage, isLoadingMessages]);
  
  const handleExamplePrompt = (prompt: string) => {
    // Check if in free trial mode
    if (isFreeTrialMode) {
      toast.error('Free Trial Limitation', {
        description: 'Sending messages is not available in free trial mode. Please use your own API key to send messages.',
        duration: 5000,
      });
      // Show modal after 3 seconds
      setTimeout(() => {
        onShowFreeTrialLimitModal?.();
      }, 3000);
      return;
    }
    
    logger.info('UI', 'Example prompt clicked', { prompt });
    sendMessage(prompt);
  };
  
  const handleCitationClick = (citation: Citation) => {
    logger.info('UI', 'Citation clicked', {
      citationId: citation.id,
      citationIndex: citation.index,
      citationTitle: citation.title
    });
    
    // Open citation details modal with the citation ID
    if (citation.id) {
      setSelectedCitationId(citation.id);
      setCitationModalOpen(true);
    }
  };
  
  const handlePreviewClick = (citation: Citation) => {
    logger.info('UI', 'Citation preview requested', {
      citationId: citation.id,
      citationTitle: citation.title
    });
    
    // Open preview modal with the citation ID
    if (citation.id) {
      setPreviewCitationId(citation.id);
      setPreviewModalOpen(true);
    }
  };
  
  const handleMessageFeedback = async (messageId: string, feedback: 'like' | 'dislike') => {
    logger.info('UI', 'Message feedback provided', {
      messageId,
      feedback
    });
    
    // Call the message store to update feedback
    await updateMessageFeedback(messageId, feedback);
  };
  
  return (
    <div
      ref={scrollRef}
      className={cn(
        'flex-1 overflow-y-auto scroll-smooth',
        'bg-gradient-to-b from-muted/50 to-background',
        className
      )}
    >
      {/* Error Message */}
      {error && (
        <div className="p-4 m-4">
          <MessageErrorDisplay 
            error={error}
            onRetry={() => {
              // Clear error first
              clearError();
              
              // Then retry sending last message if applicable
              if (currentConversation) {
                const conversationMessages = messages.get(currentConversation.id.toString()) || [];
                const lastUserMessage = conversationMessages
                  .filter(m => m.role === 'user')
                  .pop();
                
                if (lastUserMessage) {
                  // Remove the error message before retrying
                  const filteredMessages = conversationMessages.filter(m => m.id !== lastUserMessage.id);
                  setMessagesForConversation(
                    currentConversation.id.toString(), 
                    filteredMessages
                  );
                  
                  // Retry sending the message
                  sendMessage(lastUserMessage.content);
                }
              }
            }}
          />
        </div>
      )}

      {/* Loading state when switching conversations */}
      {isLoadingMessages && (
        <LoadingOverlay 
          visible={true} 
          message={conversationMessages.length > 0 ? "Loading conversation..." : "Switching to conversation..."}
          blur={true}
        />
      )}
      
      {/* Message skeleton fallback for empty conversations */}
      {isLoadingMessages && conversationMessages.length === 0 && !isStreaming && (
        <div className="space-y-0 opacity-30">
          <MessageSkeleton isAssistant={false} lines={2} />
          <MessageSkeleton isAssistant={true} lines={3} />
          <MessageSkeleton isAssistant={false} lines={1} />
          <MessageSkeleton isAssistant={true} lines={4} />
        </div>
      )}

      {/* Welcome Message */}
      {conversationMessages.length === 0 && !streamingMessage && !error && !isLoadingMessages && (
        <WelcomeMessage onPromptClick={handleExamplePrompt} />
      )}
      
      {/* Messages */}
      {conversationMessages.length > 0 && (
        <div className="space-y-0">
          {conversationMessages.map((message, index) => (
            <Message
              key={message.id}
              message={message}
              agent={currentAgent}
              isLast={index === conversationMessages.length - 1}
              onCitationClick={handleCitationClick}
              onPreviewClick={handlePreviewClick}
              onFeedback={(feedback) => handleMessageFeedback(message.id, feedback)}
              mode={mode}
            />
          ))}
        </div>
      )}
      
      {/* Streaming Message */}
      {streamingMessage && !conversationMessages.some(m => m.id === streamingMessage.id) && (
        <Message
          message={streamingMessage}
          agent={currentAgent}
          isStreaming={true}
          isLast={true}
          onCitationClick={handleCitationClick}
          onPreviewClick={handlePreviewClick}
          mode={mode}
        />
      )}
      
      {/* Typing Indicator */}
      {isStreaming && !streamingMessage && (
        <TypingIndicator />
      )}
      
      {/* Citation Details Modal */}
      {selectedCitationId && (
        <CitationDetailsModal
          isOpen={citationModalOpen}
          onClose={() => {
            setCitationModalOpen(false);
            setSelectedCitationId(null);
          }}
          citationId={selectedCitationId}
          projectId={currentAgent?.id || 0}
        />
      )}
      
      {/* Citation File Preview Modal */}
      {previewCitationId && (
        <CitationFilePreview
          isOpen={previewModalOpen}
          onClose={() => {
            setPreviewModalOpen(false);
            setPreviewCitationId(null);
          }}
          citationId={previewCitationId}
          fileName={`Citation_${previewCitationId}.txt`}
        />
      )}
    </div>
  );
};

interface ChatHeaderProps {
  /** Deployment mode affects header layout */
  mode?: 'standalone' | 'widget' | 'floating';
  /** Handler for close button (widget/floating modes) */
  onClose?: () => void;
  /** Handler for agent settings button */
  onAgentSettings?: (agent: Agent) => void;
  /** Enable conversation management UI */
  enableConversationManagement?: boolean;
  /** Maximum conversations per session */
  maxConversations?: number;
  /** Session ID for conversation isolation */
  sessionId?: string;
  /** Current conversation ID */
  currentConversationId?: string;
  /** Callback when conversation changes */
  onConversationChange?: (conversation: any) => void;
  /** Callback to create new conversation */
  onCreateConversation?: () => void;
  /** Key to trigger ConversationManager refresh */
  conversationRefreshKey?: number;
}

/**
 * ChatHeader Component
 * 
 * Header bar for the chat interface. Layout changes based on deployment mode:
 * - Standalone: Full header with agent selector
 * - Widget/Floating: Compact header with close button
 * 
 * Shows agent status (online/offline) and provides agent switching
 */
const ChatHeader: React.FC<ChatHeaderProps> = ({ 
  mode = 'standalone', 
  onClose,
  onAgentSettings,
  enableConversationManagement = false,
  maxConversations,
  sessionId,
  currentConversationId,
  onConversationChange,
  onCreateConversation,
  conversationRefreshKey
}) => {
  const { currentAgent } = useAgentStore();
  const { isMobile } = useBreakpoint();
  
  if (mode === 'widget' || mode === 'floating') {
    return (
      <header className="border-b border-border bg-background">
        {/* Header Content */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden bg-accent">
              {currentAgent?.settings?.chatbot_avatar ? (
                <img 
                  src={currentAgent.settings.chatbot_avatar} 
                  alt={`${currentAgent.project_name} avatar`} 
                  className="w-8 h-8 rounded-lg object-cover"
                />
              ) : (
                <Bot className="w-5 h-5 text-accent-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-foreground truncate">
                {currentAgent?.project_name || 'CustomGPT Assistant'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {currentAgent?.is_chat_active ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>
          
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors flex-shrink-0"
            >
              <span className="sr-only">Close</span>
              ×
            </button>
          )}
        </div>
      </header>
    );
  }
  
  // For standalone mode, show agent selector header (but not on mobile)
  if (mode === 'standalone' && !isMobile) {
    return (
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">
            Agent Chat
          </h1>
        </div>
        
        <div className="flex-1 max-w-xs ml-4">
          <AgentSelector
            onSettingsClick={onAgentSettings}
            className="w-full"
          />
        </div>
      </header>
    );
  }
  
  return null;
};

interface ChatContainerProps {
  /** Deployment mode - affects layout and styling */
  mode?: 'standalone' | 'widget' | 'floating';
  /** Additional CSS classes */
  className?: string;
  /** Handler for close button (widget/floating modes) */
  onClose?: () => void;
  /** Handler when agent settings are requested */
  onAgentSettings?: (agent: Agent) => void;
  /** Enable conversation management UI */
  enableConversationManagement?: boolean;
  /** Maximum conversations per session */
  maxConversations?: number;
  /** Session ID for conversation isolation */
  sessionId?: string;
  /** Specific conversation thread to load */
  threadId?: string;
  /** Callback when conversation changes */
  onConversationChange?: (conversation: any) => void;
  /** Callback when message is sent/received */
  onMessage?: (message: any) => void;
  /** Key to trigger ConversationManager refresh */
  conversationRefreshKey?: number;
  /** Mobile optimization mode */
  isMobile?: boolean;
}

/**
 * ChatContainer Component - Main Export
 * 
 * The primary chat interface component. Can be deployed in three modes:
 * 
 * 1. Standalone: Full-page chat interface
 *    - Use when chat is the main feature
 *    - No fixed dimensions, fills container
 * 
 * 2. Widget: Embedded chat widget
 *    - Use for embedding in existing pages
 *    - Fixed dimensions with shadow
 * 
 * 3. Floating: Floating chat bubble
 *    - Use for overlay chat interfaces
 *    - Fixed dimensions with stronger shadow
 * 
 * @example
 * // Standalone mode
 * <ChatContainer mode="standalone" />
 * 
 * @example
 * // Widget mode with close handler
 * <ChatContainer 
 *   mode="widget" 
 *   onClose={() => setShowChat(false)}
 * />
 */
export const ChatContainer: React.FC<ChatContainerProps> = ({ 
  mode = 'standalone',
  className,
  onClose,
  onAgentSettings,
  enableConversationManagement = false,
  maxConversations,
  sessionId,
  threadId,
  onConversationChange,
  onMessage,
  conversationRefreshKey,
  isMobile = false
}) => {
  const { sendMessage, isStreaming, cancelStreaming } = useMessageStore();
  const { fetchAgents, agents, currentAgent } = useAgentStore();
  const { currentConversation } = useConversationStore();
  
  // Get widget instance from context
  const widget = useWidgetSafe();
  
  // Track current conversation for the widget
  const [currentConversationId, setCurrentConversationId] = React.useState<string | null>(null);
  
  // Voice modal state
  const [isVoiceModalOpen, setIsVoiceModalOpen] = React.useState(false);
  const [voiceError, setVoiceError] = React.useState<string | null>(null);
  
  // Get demo store state
  const { isDemoMode, openAIApiKey } = useDemoStore();
  
  // Check if we're in free trial mode by looking at localStorage
  const [isFreeTrialMode, setIsFreeTrialMode] = React.useState(false);
  
  // State to control FreeTrialLimitModal visibility
  const [showFreeTrialLimitModal, setShowFreeTrialLimitModal] = React.useState(false);
  
  React.useEffect(() => {
    if (mode === 'standalone' && typeof window !== 'undefined') {
      const freeTrialFlag = localStorage.getItem('customgpt.freeTrialMode');
      setIsFreeTrialMode(freeTrialFlag === 'true');
    }
  }, [mode]);
  
  // Check if OpenAI key is available
  const checkVoiceAvailability = () => {
    // In demo mode, check if user has provided OpenAI key
    if (isDemoMode) {
      if (!openAIApiKey) {
        return {
          available: false,
          error: 'Voice feature requires an OpenAI API key. Please enable voice capability in demo settings and provide your OpenAI API key.'
        };
      }
      return { available: true };
    }
    
    // In normal mode, check if OpenAI key is in environment
    // We can't check server-side env vars from client, so we'll let the API handle it
    return { available: true };
  };
  
  // Handle voice button click
  const handleVoiceClick = () => {
    const { available, error } = checkVoiceAvailability();
    
    if (!available) {
      toast.error(error || 'Voice feature is not available');
      return;
    }
    
    setIsVoiceModalOpen(true);
  };
  
  // Handle conversation management
  const handleConversationChange = (conversation: any) => {
    setCurrentConversationId(conversation.id);
    onConversationChange?.(conversation);
    // The widget will handle the actual conversation switch
    if (widget) {
      widget.switchConversation(conversation.id);
    }
  };
  
  const handleCreateConversation = async () => {
    if (widget) {
      try {
        const newConv = await widget.createConversation();
        if (newConv) {
          setCurrentConversationId(newConv.id);
        } else {
          // Show user-friendly message when conversation limit is reached
          const maxConversations = widget.configuration?.maxConversations || 5;
          toast.error(`You've reached the maximum limit of ${maxConversations} conversations. Please delete an existing conversation to create a new one.`);
        }
      } catch (error) {
        console.error('Failed to create conversation:', error);
        toast.error('Failed to create conversation. Please try again.');
      }
    }
  };

  /**
   * Agent initialization effect
   * Fetches available agents when the component first mounts
   * Only runs if agents haven't been loaded yet
   */
  useEffect(() => {
    const initializeAgents = async () => {
      // Only fetch if we don't have agents and no current agent
      if (agents.length === 0 && !currentAgent) {
        logger.info('UI', 'Initializing agents on ChatContainer mount');
        try {
          await fetchAgents();
          logger.info('UI', 'Agents initialized successfully', {
            agentCount: agents.length
          });
        } catch (error) {
          logger.error('UI', 'Failed to initialize agents', error, {
            errorMessage: error instanceof Error ? error.message : String(error)
          });
          console.error('Failed to initialize agents:', error);
        }
      } else {
        logger.info('UI', 'Agents already initialized', {
          agentCount: agents.length,
          hasCurrentAgent: !!currentAgent,
          currentAgentName: currentAgent?.project_name
        });
      }
    };

    initializeAgents();
  }, [agents.length, currentAgent, fetchAgents]); // Add dependencies for exhaustive deps
  
  const handleSendMessage = async (content: string, files?: File[]) => {
    // Check if in free trial mode
    if (isFreeTrialMode) {
      toast.error('Free Trial Limitation', {
        description: 'Sending messages is not available in free trial mode. Please use your own API key to send messages.',
        duration: 5000,
      });
      // Show modal after 3 seconds
      setTimeout(() => {
        setShowFreeTrialLimitModal(true);
      }, 3000);
      return;
    }
    
    logger.info('UI', 'Sending message from ChatContainer', {
      contentLength: content.length,
      hasFiles: files && files.length > 0,
      fileCount: files?.length || 0,
      currentAgent: currentAgent?.project_name,
      agentId: currentAgent?.id
    });
    
    try {
      await sendMessage(content, files);
      logger.info('UI', 'Message sent successfully');
    } catch (error) {
      logger.error('UI', 'Failed to send message from ChatContainer', error, {
        errorMessage: error instanceof Error ? error.message : String(error),
        isAuthError: error instanceof Error && (error.message.includes('403') || error.message.includes('unauthorized'))
      });
      console.error('Failed to send message:', error);

      // Show clearer toast for rate limit exceeded
      try {
        const anyErr: any = error as any;
        const status = anyErr?.status;
        const data = anyErr?.data;
        if (status === 429) {
          const retryAfter = data?.details?.retryAfter ?? data?.retryAfter;
          const window = data?.details?.window ?? 'minute';
          const limit = data?.details?.limit;
          toast.error('Rate limit exceeded', {
            description: retryAfter
              ? `Too many queries for this agent. Try again in ${retryAfter} seconds.`
              : `You have hit the ${window} limit${limit ? ` (${limit})` : ''}. Please wait before retrying.`,
            duration: 5000,
          });
          return;
        }
      } catch {}

      toast.error('Failed to send', {
        description: error instanceof Error ? error.message : 'Please try again',
        duration: 4000,
      });
    }
  };
  
  const handleStopGeneration = () => {
    logger.info('UI', 'User cancelled streaming generation');
    cancelStreaming();
  };
  
  const handleAgentSettings = (agent: Agent) => {
    logger.info('UI', 'Agent settings requested', {
      agentId: agent.id,
      agentName: agent.project_name
    });
    onAgentSettings?.(agent);
  };
  
  return (
    <div
      className={cn(
        'flex flex-col bg-background',
        mode === 'standalone' && 'h-full',
        mode === 'widget' && !isMobile && 'h-[600px] w-[400px] rounded-lg shadow-xl border border-border',
        mode === 'floating' && !isMobile && 'h-[600px] w-[400px] rounded-lg shadow-2xl border border-border',
        isMobile && 'h-full w-full',
        className
      )}
    >
      <ChatHeader 
        mode={mode} 
        onClose={onClose}
        onAgentSettings={handleAgentSettings}
        enableConversationManagement={enableConversationManagement}
        maxConversations={maxConversations}
        sessionId={sessionId}
        currentConversationId={currentConversationId || currentConversation?.id.toString()}
        onConversationChange={handleConversationChange}
        onCreateConversation={handleCreateConversation}
        conversationRefreshKey={conversationRefreshKey}
      />
      <MessageArea 
        className="flex-1 overflow-y-auto" 
        mode={mode} 
        onShowFreeTrialLimitModal={() => setShowFreeTrialLimitModal(true)}
      />
      <div className={cn(
        "mt-auto",
        isMobile && mode === 'standalone' ? "pb-[30px]" : ""
      )}>
        <ChatInput
          onSend={handleSendMessage}
          disabled={isStreaming || isFreeTrialMode}
          placeholder={
            isFreeTrialMode 
              ? "Free trial mode - Use your API key to send messages" 
              : isStreaming 
                ? "AI is thinking..." 
                : "Send a message..."
          }
          onVoiceClick={handleVoiceClick}
          isMobile={isMobile}
          mode={mode}
        />
      </div>
      
      {/* Branding Footer */}
      <div className={cn(
        "px-4 py-2 border-t border-border bg-muted",
        mode === 'standalone' && "flex items-center justify-center"
      )}>
        <a
          href="https://customgpt.ai"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "text-xs text-muted-foreground hover:text-foreground transition-colors",
            mode === 'standalone' ? "inline-flex items-center" : "block text-center"
          )}
        >
          Powered by CustomGPT.ai
        </a>
      </div>
      
      {/* Voice Modal */}
      {currentAgent && currentAgent.id && (
        <VoiceModal
          isOpen={isVoiceModalOpen}
          onClose={() => setIsVoiceModalOpen(false)}
          projectId={currentAgent.id.toString()}
          projectName={currentAgent.project_name}
        />
      )}
      
      {/* Free Trial Limit Modal - shown 3 seconds after toast notification */}
      {showFreeTrialLimitModal && (
        <FreeTrialLimitModal
          onClose={() => setShowFreeTrialLimitModal(false)}
        />
      )}
    </div>
  );
};