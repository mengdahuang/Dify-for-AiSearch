<template>
  <div class="model-selector">
    <a-select
      v-model="selectedModel"
      :style="{ width: '100%' }"
      :options="modelOptions"
      placeholder="选择模型"
      @change="handleModelChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAppConfigStore } from '../stores/appConfig';

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['update:modelValue', 'change']);

const appConfigStore = useAppConfigStore();
const selectedModel = ref(props.modelValue);

// 从配置中获取模型选项
const modelOptions = computed(() => {
  return appConfigStore.config.CHAT_MODELS || [];
});

// 在组件挂载时，如果没有选择模型，则使用默认模型
onMounted(() => {
  if (!selectedModel.value) {
    const defaultModel = modelOptions.value.find(model => model.default);
    if (defaultModel) {
      selectedModel.value = defaultModel.value;
      emit('update:modelValue', defaultModel.value);
    }
  }
});

// 处理模型变更
const handleModelChange = (value: string) => {
  emit('update:modelValue', value);
  emit('change', value);
};
</script>

<style scoped>
.model-selector {
  margin-bottom: 16px;
}
</style>