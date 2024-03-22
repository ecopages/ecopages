export function LiteContextDemoEditor() {
  return (
    <lc-demo-editor>
      <p class="lc-demo__label">lc-demo-editor</p>
      <form>
        <div class="input-group">
          <label for="input-key" class="font-bold text-sm">
            Key
          </label>
          <select data-options>
            <option value="name">name</option>
            <option value="version">version</option>
          </select>
        </div>
        <div class="input-group">
          <label for="input-value" class="font-bold text-sm">
            Value
          </label>
          <input data-input id="input-value" required />
        </div>
        <button data-button type="submit">
          Update
        </button>
      </form>
    </lc-demo-editor>
  );
}
