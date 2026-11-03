import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import { initDebug } from './shell/debug';
import { useProgress } from './stores/progress';
import { useSettings } from './stores/settings';

const app = createApp(App);
app.use(createPinia());

// 子组件的 onMounted 先于 App 的 onMounted 执行：深链直达时，
// 语言偏好和调试桥必须在 mount 之前就位，否则首帧按默认中文渲染、e2e 早期读不到桥。
initDebug();
useSettings().init();
void useProgress().init();

app.mount('#app');
