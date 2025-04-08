<template>
  <div class="flex flex-col h-screen max-w-7xl mx-auto">

    <!-- 对话消息卡片 -->
    <div class="flex flex-col h-full overflow-auto scroll-hidden px-2 " ref="messagesContainer" @scroll="handleScroll">

      <!-- 初始回答卡片 -->
      <a-card title="结果:" v-if="initialAnswer" hoverable class="message-card user-message mb-4 mt-16">

        <template #extra>
          <a-space>
            <a-button type="secondary" shape="circle" size="small" @click="copyInitialAnswer">
              <icon-copy />
            </a-button>

            <a-trigger v-if="hasSerperResults(initialMessageId)" position="br" auto-fit-position
              :unmount-on-close="false" scroll-to-close update-at-scroll>
              <a-button type="primary" shape="circle" size="small">
                <icon-compass />
              </a-button>
              <template #content>
                <!-- Serper搜索结果 -->
                <SerperResults v-if="initialMessageId" :messageId="initialMessageId" @search="handleSerperSearch"
                  class="my-4" />
              </template>
            </a-trigger>
          </a-space>
        </template>

        <!-- 文档列表 -->
        <div v-if="initialSession?.files && initialSession.files.length > 0">
          <div class="flex flex-wrap gap-2">
            <a-card hoverable class="w-full" v-for="file in initialSession.files" :key="file.id">
              <div class="flex items-center justify-between">
                <span class="flex items-center">
                  <img :src="getFileIcon(file)" class="w-8 h-8 object-cover mr-2" />
                  <span class="font-medium text-base text-color">{{ file.name }}</span>
                </span>
                <a-button type="secondary" shape="circle" size="small" @click="viewFile(file)">
                  <icon-tags />
                </a-button>
              </div>
            </a-card>
          </div>
        </div>

        <MdPreview :modelValue="initialAnswer" codeTheme="a11y" :theme="mdPreviewTheme" previewTheme="cyanosis" />

        <!-- 建议问题 -->
        <div v-if="suggestedQuestions.length > 0 && followupMessages.length === 0" class="mt-4">
          <div class="text-sm font-medium text-gray-500 mb-2">您可能想问：</div>
          <div class="flex flex-wrap gap-2">
            <a-tag v-for="(question, qIndex) in suggestedQuestions" :key="qIndex" color="arcoblue"
              class="cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-800"
              @click="handleSuggestedQuestion(question)">
              {{ question }}
            </a-tag>
          </div>
        </div>
      </a-card>

      <!-- 后续对话卡片 -->
      <template v-for="(message, index) in followupMessages" :key="index">
        <!-- 用户提问卡片 -->

        <a-card hoverable class="w-full message-card user-message mb-3">
          <div class="flex items-center justify-between">
            <span class="flex items-center">
              <a-avatar class="mr-2" :size="32" :style="{ backgroundColor: 'rgb(var(--primary-6))' }">
                <IconUser />
              </a-avatar>
              <span class="font-medium text-base text-color">{{ message.question }}</span>
            </span>
            <!-- <a-link>More</a-link> -->
          </div>
        </a-card>

        <!-- AI回答卡片 -->
        <a-card title="回答:" hoverable class="message-card ai-message mb-4" v-if="message.answer">
          <template #extra>

            <a-space>
              <a-button type="secondary" shape="circle" size="small" @click="() => copyAiAnswer(message.answer)">
                <icon-copy />
              </a-button>

              <a-trigger v-if="hasSerperResults(message.message_id) && message.message_id" position="br"
                auto-fit-position :unmount-on-close="false">
                <a-button type="primary" shape="circle" size="small">
                  <icon-compass />
                </a-button>
                <template #content>
                  <!-- Serper搜索结果 -->
                  <SerperResults v-if="message.message_id" :messageId="message.message_id" @search="handleSerperSearch"
                    class="my-4" />
                </template>
              </a-trigger>
            </a-space>
          </template>


          <MdPreview :modelValue="message.answer" codeTheme="a11y" :theme="mdPreviewTheme" previewTheme="cyanosis" />


          <!-- 建议问题 - 只在最后一个回答中显示 -->
          <div v-if="index === followupMessages.length - 1 && suggestedQuestions.length > 0" class="mt-4">
            <div class="text-sm font-medium text-gray-500 mb-2">您可能想问：</div>
            <div class="flex flex-wrap gap-2">
              <a-tag v-for="(question, qIndex) in suggestedQuestions" :key="qIndex" color="arcoblue"
                class="cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-800"
                @click="handleSuggestedQuestion(question)">
                {{ question }}
              </a-tag>
            </div>
          </div>
        </a-card>
      </template>

      <!-- 加载状态 -->
      <a-result class="mt-16" title="任务进行中，请稍候..."
        v-if="loading && ((!initialAnswer && !currentAnswerInProgress) || (currentSession?.conversation_id && currentUserQuestion && !currentAnswerInProgress))">
        <template #icon>
          <icon-face-smile-fill />
        </template>
        <template #subtitle>

          <div v-if="currentNode" class="text-sm">
            <div class="flex items-center mt-2">
              <a-tag color="arcoblue" size="small">{{ currentNode }}</a-tag>
              <a-progress :percent="nodeProgress" size="small" :show-text="false" style="width: 100%; margin-left: 8px;"
                status="warning" :color="{
                  '0%': 'rgb(var(--primary-6))',
                  '100%': 'rgb(var(--success-6))',
                }" />
            </div>
            <!-- <div class="mt-2 text-xs text-gray-500" v-if="executedNodes.length > 0">
              <div>已完成节点:</div>
              <a-space wrap size="mini" class="mt-1">
                <a-tag v-for="(node, index) in executedNodes.slice(0, -1)" :key="index" color="green" size="small">{{
                  node
                  }}</a-tag>
              </a-space>
            </div> -->
          </div>
          <div v-else class="text-sm text-gray-500">初始化中...</div>
        </template>
      </a-result>
    </div>

    <!-- 错误提示 -->
    <div v-if="error"
      class="error-container bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg">
      <div class="flex items-center">
        <i class="icon-alert-circle mr-2"></i>
        <div>{{ error }}</div>
      </div>
    </div>


    <!-- 输入框 -->
    <div class="py-4" :class="{ 'input-visible': true }">
      <div class="flex flex-col space-y-2 w-full max-w-7xl mx-auto search-box rounded-xl p-2">
        <!-- 模型选择器 - 仅在对话模式下显示 -->
        <ModelSelector v-if="searchType === 'chat'" v-model="selectedModel" @change="handleModelChange" />
        
        <div class="flex space-x-2 items-center justify-center">
          <a-textarea v-model="followupQuery" placeholder="请输入您的问题..."
            @keydown.enter.prevent="(event) => handleEnterKey(event)" :auto-size="{ minRows: 2, maxRows: 5 }"
            allow-clear />
          <a-button type="primary" shape="circle" @click="handleInputAction" :status="loading ? 'danger' : 'normal'">
            <icon-loading v-if="loading" />
            <icon-send v-else />
          </a-button>
        </div>
      </div>
    </div>

    <!-- 返回顶部按钮 -->
    <div class="scroll-control-group" style="opacity: 1; visibility: visible;">
      <a-button class="scroll-control-btn" type="primary" shape="circle" size="mini" @click="scrollToTop" title="回到顶部"
        :disabled="isAtTop">
        <icon-arrow-up />
      </a-button>
      <a-button class="scroll-control-btn" type="primary" shape="circle" size="mini" @click="scrollToBottom"
        title="滚动到底部" :disabled="isAtBottom">
        <icon-arrow-down />
      </a-button>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { searchAPI, getChatHistory, saveChatSession } from '../../api/search';
import { searchWithSerper, getSerperResultByMessageId } from '../../api/serper';
import { MdPreview } from 'md-editor-v3';
import 'md-editor-v3/lib/style.css';
import { useAppConfigStore } from '../../stores/appConfig';
import { useThemeStore } from '../../stores/theme';
import { Message } from '@arco-design/web-vue';
import SerperResults from './SerperResults.vue';
import ModelSelector from '../ModelSelector.vue';

const route = useRoute();
const router = useRouter();
const appConfig = useAppConfigStore();
const themeStore = useThemeStore();

const props = defineProps({
  query: {
    type: String,
    required: true
  },
  searchType: {
    type: String,
    required: true
  },
  options: {
    type: Object,
    default: () => ({})
  }
});

// 模型选择
const selectedModel = ref('');

// 在组件挂载时，设置默认模型
onMounted(() => {
  if (props.searchType === 'chat') {
    const defaultModel = appConfig.config.CHAT_MODELS?.find((model: any) => model.default);
    if (defaultModel) {
      selectedModel.value = defaultModel.value;
    }
  }
});

// 处理模型变更
const handleModelChange = (model: string) => {
  console.log('模型已更改:', model);
  selectedModel.value = model;
};

const emit = defineEmits(['resultReady', 'error', 'searchComplete', 'updateQuery']);

// 状态变量
const loading = ref(false);
const resultContent = ref(''); // 保留此变量用于兼容性
const error = ref('');
const searchComplete = ref(false);

// 节点执行状态
const currentNode = ref('');
const nodeProgress = ref(0);
const executedNodes = ref<string[]>([]);

// 会话相关状态
const currentSession = ref<any>(null);
const showFollowupInput = ref(true);
const followupQuery = ref('');

// 对话消息管理
const initialAnswer = ref(''); // 初始回答
const initialMessageId = ref(''); // 初始回答的消息ID
const followupMessages = ref<Array<{ question: string, answer: string, message_id: string }>>([]);
const currentUserQuestion = ref(''); // 当前提问
const currentAnswerInProgress = ref(''); // 当前正在生成的回答
const suggestedQuestions = ref<string[]>([]); // 建议问题列表
const currentMessageId = ref(''); // 当前消息ID

// 格式化结果 (保留此计算属性用于兼容性)
const formattedResult = computed(() => {
  return resultContent.value || '';
});

// 计算属性：根据主题设置动态计算 MdPreview 的主题
const mdPreviewTheme = computed(() => themeStore.isDark ? 'dark' : 'light');

// 初始会话
const initialSession = ref<any>(null);

// 加载历史会话
const loadHistorySession = async () => {
  const sessionId = route.query.session_id as string;
  const conversationId = route.query.conversation_id as string;

  // 如果是按会话ID加载
  if (conversationId) {
    // 从历史记录中查找属于该对话的所有消息
    const history = getChatHistory();
    const conversationMessages = history.filter(item =>
      item.conversation_id === conversationId || item.id === conversationId
    ).sort((a, b) => a.timestamp - b.timestamp); // 按时间先后排序

    if (conversationMessages.length > 0) {
      // 获取初始消息和后续追问
      const initialMessage = conversationMessages[0];
      const followups = conversationMessages.slice(1);

      // 设置初始消息
      currentSession.value = initialMessage;
      initialSession.value = initialMessage;
      initialAnswer.value = initialMessage.answer || '';
      resultContent.value = initialMessage.answer || '';

      // 设置初始消息ID
      initialMessageId.value = initialMessage.message_id || initialMessage.id || '';

      // 设置后续消息
      followupMessages.value = followups.map(msg => ({
        question: msg.query,
        answer: msg.answer || '',
        message_id: msg.message_id || msg.id || ''
      }));

      // 更新界面状态
      showFollowupInput.value = true;
      loading.value = false;
      searchComplete.value = true;

      emit('resultReady', resultContent.value);
      emit('searchComplete', {
        content: resultContent.value,
        searchType: initialMessage.search_type
      });

      return true;
    }
  }
  // 兼容旧版单个会话ID的加载方式
  else if (sessionId) {
    // 从历史记录中查找对应的会话
    const history = getChatHistory();
    const session = history.find(item => item.id === sessionId);

    if (session) {
      // 找到会话，还原状态
      currentSession.value = session;
      initialSession.value = session;
      initialAnswer.value = session.answer || '';
      resultContent.value = session.answer || '';
      showFollowupInput.value = true;
      loading.value = false;
      searchComplete.value = true;

      emit('resultReady', resultContent.value);
      emit('searchComplete', {
        content: resultContent.value,
        searchType: session.search_type
      });

      return true;
    }
  }

  return false;
};

// 执行搜索
const executeSearch = async () => {
  // 先尝试加载历史会话
  const historyLoaded = await loadHistorySession();
  if (historyLoaded) {
    scrollToBottom(); // 加载历史会话后滚动到底部
    return;
  }

  // 重置状态
  loading.value = true;
  resultContent.value = '';
  initialAnswer.value = '';
  initialSession.value = null;
  followupMessages.value = [];
  currentUserQuestion.value = followupQuery.value || props.query; // 使用输入框内容或props.query
  followupQuery.value = ''; // 清空输入框
  currentAnswerInProgress.value = ''; // 清空当前进行中的回答
  error.value = '';
  searchComplete.value = false;
  currentNode.value = '';
  nodeProgress.value = 0;
  executedNodes.value = [];
  currentSession.value = null;

  // 搜索关键词
  const searchQuery = currentUserQuestion.value;

  // 更新顶部显示的查询内容
  emit('updateQuery', searchQuery);
  
  // 获取搜索选项
  const searchOptions = { ...props.options };
  
  // 如果是对话模式，添加模型选择
  if (props.searchType === 'chat' && selectedModel.value) {
    searchOptions.model = selectedModel.value;
    console.log('使用ChatGPT模型:', selectedModel.value);
  }

  // 开始流式搜索
  searchAPI.debouncedStreamSearch(
    searchQuery,
    props.searchType,
    searchOptions,
    // 处理接收到的数据
    (data) => {
      if (data.event === 'message') {
        // 接收文本消息
        initialAnswer.value += data.answer || '';
        resultContent.value += data.answer || ''; // 保持兼容性
        
        // 只有在用户没有滚动时才自动滚动到底部
        if (isNearBottom.value) {
          scrollToBottom();
        }
      } else if (data.event === 'message_end') {
        // 消息结束 - 不在这里调用onSearchComplete，只在最终回调中调用
        if (data.message_id && !initialMessageId.value) {
          initialMessageId.value = data.message_id;
          currentMessageId.value = data.message_id; // 也设置当前消息ID

          // 获取建议问题
          fetchSuggestedQuestions(data.message_id);
        }
        
        // 只有在用户没有滚动时才自动滚动到底部
        if (isNearBottom.value) {
          scrollToBottom();
        }
      } else if (data.event === 'message_replace') {
        // 消息替换
        initialAnswer.value = data.answer || '';
        resultContent.value = data.answer || ''; // 保持兼容性
      } else if (data.event === 'workflow_started') {
        console.log('工作流开始执行');
      } else if (data.event === 'node_started') {
        currentNode.value = data.data?.title || '';
        nodeProgress.value = 0;
        executedNodes.value.push(currentNode.value);
        console.log('节点开始执行', currentNode.value);
      } else if (data.event === 'node_finished') {
        nodeProgress.value = 100;
        console.log('节点执行完成', currentNode.value);
      } else if (data.event === 'progress') {
        nodeProgress.value = data.data?.progress || 0;
      }
    },
    // 搜索完成
    (sessionData) => {
      onSearchComplete(sessionData);
    },
    // 错误处理
    (err) => {
      loading.value = false;
      error.value = typeof err === 'string' ? err : err.message || '搜索时发生错误';
      emit('error', error.value);

      // 直接更新followupMessages数组中的错误信息
      if (followupMessages.value.length > 0) {
        followupMessages.value[followupMessages.value.length - 1].answer = `*发生错误: ${error.value}*`;
      }

      // 清空当前状态
      currentUserQuestion.value = '';
      currentAnswerInProgress.value = '';
    }
  );
};

// 发送后续提问
const sendFollowupQuery = () => {
  // 检查是否有内容可发送
  if (!followupQuery.value.trim()) {
    return;
  }

  // 保存用户问题
  const userQuestion = followupQuery.value;

  // 清空输入框
  followupQuery.value = '';

  // 检查是否有活跃的会话
  if (!currentSession.value || !currentSession.value.conversation_id) {
    console.log('没有活跃的会话ID，将启动新对话');
    // 如果没有会话ID，启动一个全新的对话（相当于执行首次搜索）
    // 先更新查询内容，确保使用新输入的内容
    // props.query = userQuestion; // u4e0du80fdu76f4u63a5u4feeu6539props
    // u7acbu5373u53d1u9001u66f4u65b0u4e8bu4ef6uff0cu786eu4fddu754cu9762u540cu6b65
    emit('updateQuery', userQuestion);
    // 执行新搜索
    executeSearch();
    return;
  }

  // 以下是继续现有对话的逻辑
  // 设置状态
  loading.value = true;
  searchComplete.value = false;
  error.value = '';
  currentNode.value = '';
  nodeProgress.value = 0;
  executedNodes.value = [];

  // 清空当前正在构建的答案，以便显示加载状态
  currentAnswerInProgress.value = '';

  // 立即将用户问题添加到对话中显示
  followupMessages.value.push({
    question: userQuestion,
    answer: "",
    message_id: `temp-${Date.now()}`
  });

  // 记录当前问题在数组中的索引
  const currentQuestionIndex = followupMessages.value.length - 1;

  // 清空建议问题列表
  suggestedQuestions.value = [];

  currentUserQuestion.value = userQuestion;

  // 发送提问后立即滚动到底部，以显示用户问题
  // 这里强制滚动（不检查isNearBottom），确保用户能看到自己发送的问题
  nextTick(() => {
    scrollToBottom();
    // 强制设置isNearBottom为true，以便接收回答时继续自动滚动
    isNearBottom.value = true;
  });

  // 构建完整对话内容（用于保存到resultContent以保持兼容性）
  resultContent.value = initialAnswer.value;
  followupMessages.value.forEach(message => {
    resultContent.value += `\n\n---\n\n**我的提问**: ${message.question}\n\n${message.answer}`;
  });
  resultContent.value += `\n\n---\n\n**我的提问**: ${userQuestion}\n\n`;

  // 继续对话
  // 确保传递模型信息
  if (props.searchType === 'chat' && selectedModel.value && !currentSession.value.model) {
    currentSession.value.model = selectedModel.value;
  }
  
  searchAPI.continueChat(
    currentSession.value,
    userQuestion,
    // 处理接收到的数据
    (data) => {
      if (data.event === 'message') {
        // 接收文本消息
        currentAnswerInProgress.value += data.answer || '';

        // 实时更新当前对话的回答
        if (followupMessages.value[currentQuestionIndex]) {
          followupMessages.value[currentQuestionIndex].answer += data.answer || '';
        }

        resultContent.value += data.answer || ''; // 保持兼容性
        
        // 只有在用户没有滚动时才自动滚动到底部
        if (isNearBottom.value) {
          scrollToBottom(); // 收到消息后滚动到底部
        }
      } else if (data.event === 'message_end') {
        // 消息结束
        // 不在这里调用onSearchComplete，只在最终回调中调用
        if (data.message_id) {
          // 只修改当前消息ID，不修改初始消息ID
          currentMessageId.value = data.message_id;

          // 更新临时消息ID为实际消息ID
          if (followupMessages.value[currentQuestionIndex]) {
            followupMessages.value[currentQuestionIndex].message_id = data.message_id;
          }

          // 获取建议问题
          fetchSuggestedQuestions(data.message_id);
        }
        
        // 只有在用户没有滚动时才自动滚动到底部
        if (isNearBottom.value) {
          scrollToBottom(); // 消息结束时滚动到底部
        }
      } else if (data.event === 'message_replace') {
        // 消息替换 - 只替换当前回答
        currentAnswerInProgress.value = data.answer || '';

        // 更新对话历史中的回答
        if (followupMessages.value[currentQuestionIndex]) {
          followupMessages.value[currentQuestionIndex].answer = data.answer || '';
        }

        // 更新resultContent（保持兼容性）
        const lastQuestionIndex = resultContent.value.lastIndexOf('**我的提问**:');
        if (lastQuestionIndex > -1) {
          const questionEndIndex = resultContent.value.indexOf('\n\n', lastQuestionIndex);
          if (questionEndIndex > -1) {
            resultContent.value = resultContent.value.substring(0, questionEndIndex + 2) + (data.answer || '');
          }
        }
      } else if (data.event === 'workflow_started') {
        console.log('工作流开始执行');
      } else if (data.event === 'node_started') {
        currentNode.value = data.data?.title || '';
        nodeProgress.value = 0;
        executedNodes.value.push(currentNode.value);
        console.log('节点开始执行', currentNode.value);
      } else if (data.event === 'node_finished') {
        nodeProgress.value = 100;
        console.log('节点执行完成', currentNode.value);
      } else if (data.event === 'progress') {
        nodeProgress.value = data.data?.progress || 0;
      }
    },
    // 搜索完成
    (sessionData) => {
      onSearchComplete(sessionData);
    },
    // 错误处理
    (err) => {
      loading.value = false;
      error.value = typeof err === 'string' ? err : err.message || '搜索时发生错误';
      emit('error', error.value);

      // 直接更新followupMessages数组中的错误信息
      if (followupMessages.value.length > 0) {
        followupMessages.value[followupMessages.value.length - 1].answer = `*发生错误: ${error.value}*`;
      }

      // 清空当前状态
      currentUserQuestion.value = '';
      currentAnswerInProgress.value = '';
    }
  );
};

// 搜索完成回调
const onSearchComplete = async (data: any) => {
  // 避免重复调用
  if (searchComplete.value) {
    console.log('搜索已经标记为完成，忽略重复的完成回调');
    return;
  }

  searchComplete.value = true;
  loading.value = false;

  // 更新会话ID
  if (data && data.conversation_id) {
    currentSession.value = data;
    initialSession.value = data;

    // 保存消息ID用于获取建议问题和Serper结果
    if (data.message_id) {
      currentMessageId.value = data.message_id;

      // 如果是初始搜索且初始消息ID还未设置，则设置它
      if (!initialMessageId.value && initialAnswer.value && followupMessages.value.length === 0) {
        console.log('设置初始消息ID:', data.message_id);
        initialMessageId.value = data.message_id;
      }

      // 获取建议问题
      fetchSuggestedQuestions(data.message_id);
    } else if (data.id) { // 兼容旧版本
      currentMessageId.value = data.id;

      // 如果是初始搜索且初始消息ID还未设置，则设置它
      if (!initialMessageId.value && initialAnswer.value && followupMessages.value.length === 0) {
        console.log('使用旧版ID设置初始消息ID:', data.id);
        initialMessageId.value = data.id;
      }

      // 获取建议问题
      fetchSuggestedQuestions(data.id);
      console.warn('使用旧版ID获取建议问题，应该使用message_id');
    }
  }

  // 允许继续追问
  showFollowupInput.value = true;

  emit('resultReady', resultContent.value);
  emit('searchComplete', {
    content: resultContent.value,
    searchType: props.searchType
  });

  // 如果是后续对话，添加到历史记录中（检查是否已存在）
  if (currentUserQuestion.value && currentAnswerInProgress.value) {
    // 检查是否已经添加了该问题的回答
    const alreadyExists = followupMessages.value.some(msg =>
      msg.question === currentUserQuestion.value
    );

    if (!alreadyExists) {
      // 只有在不存在时才添加到历史记录
      followupMessages.value.push({
        question: currentUserQuestion.value,
        answer: currentAnswerInProgress.value,
        message_id: data.message_id || data.id || ''
      });
    } else {
      // 如果已存在，则找到对应的消息并更新最终答案和消息ID
      const existingMsgIndex = followupMessages.value.findIndex(msg =>
        msg.question === currentUserQuestion.value
      );

      if (existingMsgIndex !== -1) {
        // 确保消息ID是最新的
        followupMessages.value[existingMsgIndex].message_id = data.message_id || data.id || followupMessages.value[existingMsgIndex].message_id;
        // 确保答案是完整的
        followupMessages.value[existingMsgIndex].answer = currentAnswerInProgress.value;
      }

      console.log('问题已存在，更新现有记录');
    }

    // 更新会话中的完整对话内容
    currentSession.value.answer = resultContent.value;

    // 确保在session中设置了answer字段
    data.answer = resultContent.value;

    // 手动保存会话历史，确保answer被正确保存
    if (data.id && data.query) {
      saveChatSession(data);

      // 更新文件预览URL
      if (data.conversation_id && data.message_id && data.files && data.files.length > 0) {
        console.log('开始更新文件预览URL');
        try {
          await searchAPI.updateFilePreviewUrls(data);
        } catch (error) {
          console.error('更新文件预览URL时出错:', error);
        }
      }
    } else {
      console.warn('无法保存会话，缺少必要字段', data);
    }

    // 清空当前状态
    currentUserQuestion.value = '';
    currentAnswerInProgress.value = '';
  } else if (initialAnswer.value) {
    // 初始对话，确保答案保存 
    data.answer = initialAnswer.value;

    // 手动保存会话历史，确保answer被正确保存
    if (data.id && data.query) {
      saveChatSession(data);

      // 更新文件预览URL
      if (data.conversation_id && data.message_id && data.files && data.files.length > 0) {
        console.log('开始更新文件预览URL');
        try {
          await searchAPI.updateFilePreviewUrls(data);
        } catch (error) {
          console.error('更新文件预览URL时出错:', error);
        }
      }
    } else {
      console.warn('无法保存会话，缺少必要字段', data);
    }
  }
};

// 用于跟踪已经请求过建议问题的消息ID
const suggestedQuestionsRequested = ref(new Set<string>());

// 获取建议问题
const fetchSuggestedQuestions = async (messageId: string) => {
  try {
    // 检查消息ID是否有效
    if (!messageId || (typeof messageId !== 'string')) {
      console.warn('无效的消息ID，无法获取建议问题');
      return;
    }

    // 检查是否已经请求过这个消息ID的建议问题
    if (suggestedQuestionsRequested.value.has(messageId)) {
      console.log('已经请求过该消息ID的建议问题，跳过重复请求:', messageId);
      return;
    }

    // 如果是生成的临时消息ID，不获取建议问题
    if (messageId.startsWith('temp-msg-') || messageId.startsWith('legacy-msg-')) {
      console.log('临时消息ID，跳过获取建议问题:', messageId);
      return;
    }

    // 仅当是UUID格式的消息ID或服务器返回的标准格式才尝试获取建议问题
    if (messageId.includes('-') || messageId.length >= 32) {
      console.log('获取建议问题，消息ID:', messageId);

      // 标记为已请求
      suggestedQuestionsRequested.value.add(messageId);

      const questions = await searchAPI.getSuggestedQuestions(messageId);
      suggestedQuestions.value = questions || [];
      scrollToBottom();
      console.log('获取到建议问题:', suggestedQuestions.value);
    } else {
      console.warn('消息ID格式不正确，跳过获取建议问题:', messageId);
    }
  } catch (error) {
    console.error('获取建议问题失败:', error);
    suggestedQuestions.value = [];
  }
};

// 复制文本到剪贴板
const copyToClipboard = (text: string) => {
  if (!text) {
    Message.warning('没有可复制的内容');
    return;
  }

  // 去除markdown标记，保留纯文本
  const plainText = text.replace(/#{1,6}\s+/g, '') // 去除标题
    .replace(/\*\*(.+?)\*\*/g, '$1') // 去除加粗
    .replace(/\*(.+?)\*/g, '$1') // 去除斜体
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // 去除链接，只保留文本
    // .replace(/`{1,3}(.+?)`{1,3}/g, '$1') // 去除代码块
    .replace(/\n\s*[-*+]\s+/g, '\n- '); // 规范化列表项

  navigator.clipboard.writeText(plainText)
    .then(() => {
      Message.success('已复制到剪贴板');
    })
    .catch(err => {
      console.error('复制失败:', err);
      Message.error('复制失败，请重试');
    });
};

// 复制初始回答
const copyInitialAnswer = () => {
  copyToClipboard(initialAnswer.value);
};

// 复制AI回答
const copyAiAnswer = (answer: string) => {
  copyToClipboard(answer);
};

// 复制进行中的回答
const copyAnswerInProgress = () => {
  copyToClipboard(currentAnswerInProgress.value);
};

const handleInputAction = () => {
  if (loading.value) {
    // 停止搜索
    stopSearchResponse();
  } else {
    sendFollowupQuery();
  }
};

const stopSearchResponse = async () => {
  try {
    await searchAPI.stopSearch();

    // 重置状态
    loading.value = false;
    searchComplete.value = true;

    // 向结果中添加停止提示
    if (currentAnswerInProgress.value) {
      // 将当前正在进行的回答添加到历史记录中并标记为已停止
      if (currentUserQuestion.value) {
        followupMessages.value.push({
          question: currentUserQuestion.value,
          answer: currentAnswerInProgress.value + '\n\n*回答已停止...*',
          message_id: ''
        });

        // 清空当前问答，便于下一次提问
        currentUserQuestion.value = '';
        currentAnswerInProgress.value = '';
      }
    } else if (initialAnswer.value) {
      // 如果是初始回答被停止
      initialAnswer.value += '\n\n*回答已停止...*';

      // 如果没有得到会话ID，模拟一个会话以便能够继续提问
      if (!currentSession.value || !currentSession.value.conversation_id) {
        currentSession.value = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          conversation_id: '', // 留空，下次会当作新对话
          query: props.query,
          search_type: props.searchType,
          timestamp: Date.now(),
          answer: initialAnswer.value
        };
      }
    }

    // 确保输入框可用于继续对话
    showFollowupInput.value = true;

    // 重置输入框状态，使其能够接受新的查询
    followupQuery.value = '';
  } catch (error) {
    console.error('停止搜索失败:', error);
  }
};

// 处理建议问题点击
const handleSuggestedQuestion = (question: string) => {
  followupQuery.value = question;
  handleInputAction();
}

// 处理Enter键按下事件
const handleEnterKey = (event: KeyboardEvent) => {
  // 如果按下Shift键+Enter，则手动插入换行符
  if (event.shiftKey) {
    // 阻止默认行为
    event.preventDefault();

    // 手动在当前光标位置插入换行符
    const textarea = event.target as HTMLTextAreaElement;
    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const value = followupQuery.value;

    // 在光标位置插入换行符
    followupQuery.value = value.substring(0, startPos) + '\n' + value.substring(endPos);

    // 设置新的光标位置
    nextTick(() => {
      textarea.selectionStart = textarea.selectionEnd = startPos + 1;
    });

    return;
  }

  // 如果仅按下Enter键，则发送消息
  event.preventDefault(); // 阻止默认的换行行为
  handleInputAction(); // 触发发送消息动作
};

// 处理Serper结果中的相关搜索点击
const handleSerperSearch = (query: string) => {
  console.log('处理Serper相关搜索:', query);
  // 将相关搜索设置为用户问题
  currentUserQuestion.value = query;
  // 发送后续提问
  sendFollowupQuery(); // u4e0du4f20u53c2u6570uff0cu4f7fu7528u5185u90e8currentUserQuestionu72b6u6001
  
  // u901au77e5u7236u7ec4u4ef6u67e5u8be2u5df2u66f4u65b0
  emit('updateQuery', query);
  
  // u89e6u53d1u641cu7d22u4e8bu4ef6
  emit('searchComplete', {
    query: query,
    type: props.searchType || 'web'
  });
};

// 暴露给父组件的方法
defineExpose({
  executeSearch
});

// 监听路由变化，处理从历史记录跳转过来的情况
watch(() => route.query.session_id, () => {
  if (route.query.session_id) {
    loadHistorySession();
  }
});

// 组件挂载时执行搜索
onMounted(() => {
  if (props.query) {
    executeSearch();
  }

  // 添加滚动事件监听器
  if (messagesContainer.value) {
    messagesContainer.value.addEventListener('scroll', handleScroll);
  }
});

// 组件卸载时清理滚动事件监听
onUnmounted(() => {
  // 清理工作...

  // 移除滚动事件监听器
  if (messagesContainer.value) {
    messagesContainer.value.removeEventListener('scroll', handleScroll);
  }
});

// 滚动相关状态
const messagesContainer = ref<HTMLElement | null>(null);
const isUserScrolling = ref(false); // 标记用户是否正在滚动
const isNearBottom = ref(true); // 标记是否接近底部
const showBackToTop = ref(true); // 控制返回顶部按钮显示
const isAtTop = ref(true); // 是否在顶部
const isAtBottom = ref(false); // 是否在底部
const userScrollTimestamp = ref(0); // 记录用户最后一次滚动的时间戳

// 检测是否接近底部的函数
const checkIfNearBottom = () => {
  if (!messagesContainer.value) return true;

  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
  // 如果滚动位置接近底部（距离底部30px以内），则认为是在底部
  return scrollHeight - scrollTop - clientHeight < 80;
};

// 监听滚动事件
const handleScroll = () => {
  if (!messagesContainer.value) return;

  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;

  isNearBottom.value = checkIfNearBottom();

  // 检查是否在顶部或底部
  isAtTop.value = scrollTop <= 0;
  isAtBottom.value = scrollHeight - scrollTop - clientHeight <= 1;

  // 记录用户最后一次滚动的时间戳
  userScrollTimestamp.value = Date.now();
};

// 滚动到底部函数 - 支持按钮直接触发
const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      // 使用平滑滚动代替直接设置scrollTop
      messagesContainer.value.scrollTo({
        top: messagesContainer.value.scrollHeight,
        behavior: 'smooth'
      });
    }
  });
};

// 滚动到顶部
const scrollToTop = () => {
  if (!messagesContainer.value) return;

  messagesContainer.value.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
};

// 监听初始答案和后续回答的变化，触发滚动
watch([initialAnswer, () => followupMessages.value.length], () => {
  // 只有在用户没有滚动时才自动滚动到底部
  if (isNearBottom.value) {
    scrollToBottom();
  }
});

// 监听当前正在进行的回答，触发滚动
watch(currentAnswerInProgress, () => {
  // 只有在用户没有滚动时才自动滚动到底部
  if (isNearBottom.value) {
    scrollToBottom();
  }
});

// 监听后续消息的变化，确保滚动到底部
watch(() => followupMessages.value, () => {
  // 只有在用户没有滚动时才自动滚动到底部
  if (isNearBottom.value) {
    scrollToBottom();
  }
}, { deep: true });

// 查看文件
const viewFile = (file: any) => {
  if (file.url) {
    window.open(file.url, '_blank');
  } else {
    // 如果没有直接链接，尝试获取文件信息
    searchAPI.getFileInfo(file.id)
      .then((fileInfo) => {
        if (fileInfo.url) {
          window.open(fileInfo.url, '_blank');
        } else {
          Message.error('无法打开文件，请重试');
        }
      })
      .catch((error) => {
        console.error('获取文件信息失败:', error);
        Message.error('无法打开文件，请重试');
      });
  }
};

// 判断是否有Serper结果
const hasSerperResults = (messageId: string) => {
  if (!messageId) return false;

  try {
    // 使用getSerperResultByMessageId函数检查是否有Serper结果
    const result = getSerperResultByMessageId(messageId);

    // 如果没有结果，则返回false
    if (!result) return false;

    // 如果有结果，则检查是否有搜索结果
    return !!(result.result && (
      (result.result.organic && result.result.organic.length > 0) ||
      (result.result.images && result.result.images.length > 0) ||
      (result.result.relatedSearches && result.result.relatedSearches.length > 0)
    ));
  } catch (error) {
    console.error('检查Serper结果失败:', error);
    return false;
  }
}

const excelFiles = ['xlsx', 'xls', 'csv'];
const documentFiles = ['docx', 'doc', 'txt', 'rtf'];
const presentationFiles = ['pptx', 'ppt'];
const pdfFiles = ['pdf'];
const markdownFiles = ['md', 'markdown'];
const emailFiles = ['eml', 'msg'];
const otherDocumentFiles = ['html', 'xml', 'epub'];

// 判断文件类型的函数
const getFileIcon = (file) => {
  if (file.type === 'image') {
    return 'https://io.onenov.cn/file/202503071432073.png';
  } else if (pdfFiles.includes(file.extension?.toLowerCase())) {
    return 'https://io.onenov.cn/file/202503071438194.png';
  } else if (excelFiles.includes(file.extension?.toLowerCase())) {
    return 'https://io.onenov.cn/file/202503071444873.png'; // Excel图标
  } else if (documentFiles.includes(file.extension?.toLowerCase())) {
    return 'https://io.onenov.cn/file/202503071444124.png'; // 文档图标
  } else if (presentationFiles.includes(file.extension?.toLowerCase())) {
    return 'https://io.onenov.cn/file/202503071444546.png'; // PPT图标
  } else if (markdownFiles.includes(file.extension?.toLowerCase())) {
    return 'https://io.onenov.cn/file/202503071444575.png'; // Markdown图标
  } else if (otherDocumentFiles.includes(file.extension?.toLowerCase())) {
    return 'https://io.onenov.cn/file/202503071446728.png'; // 其他文档图标
  } else if (file.type === 'video') {
    return 'https://io.onenov.cn/file/202503071435074.png';
  } else if (file.type === 'audio') {
    return 'https://io.onenov.cn/file/202503071436581.png';
  } else {
    return 'https://io.onenov.cn/file/202503071435393.png'; // 默认图标
  }
};
</script>

<style scoped lang="less">
.message-card {
  transition: all 0.3s ease;
  width: 100%;
}

.user-message {
  border-left: 4px solid rgb(var(--primary-6));
}

.user-message:hover {
  border: 4px solid rgb(var(--primary-6));
}

.ai-message {
  border-left: 4px solid rgb(var(--success-6));
}

.ai-message:hover {
  border: 4px solid rgb(var(--success-6));
}


// 加载动画
.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(64, 128, 255, 0.2);
  border-radius: 50%;
  border-top-color: var(--color-primary, #4080ff);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.scroll-control-group {
  position: fixed;
  right: 10px;
  bottom: 50vh;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transform: translateY(50%);
  transition: opacity 0.3s, visibility 0.3s;
}

.scroll-control-btn {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  opacity: 1;
  transition: opacity 0.3s, box-shadow 0.3s;
}

.scroll-control-btn:disabled {
  opacity: 0.5;
  box-shadow: none;
  cursor: not-allowed;
}

.scroll-control-btn:last-child {
  margin-bottom: 0;
}

</style>
