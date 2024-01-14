function counterController() {
  return {
    count: 0,
    increment() {
      this.count++;
    },
    decrement() {
      this.count = this.count > 0 ? this.count - 1 : this.count;
    }
  }
}

document.addEventListener('alpine:init', () => {
  window.Alpine.data("counter", counterController);
});
