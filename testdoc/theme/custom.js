// 监听pagetoc动态生成，自动全部展开
const observer = new MutationObserver(() => {
  document.querySelectorAll('.pagetoc details').forEach(el => {
    el.setAttribute('open', 'open');
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// 兜底：页面加载完成再执行一次
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.pagetoc details').forEach(el => {
    el.setAttribute('open', 'open');
  });
});
