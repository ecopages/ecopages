export function Message({ text, numberOfClicks = 1 }: { text: string; numberOfClicks?: number }) {
  return (
    <div class="lite-renderer-message">
      <span safe>{`${text} - ${numberOfClicks} Times`}</span>
      <p>This element has been rendered using @kitajs/html</p>
    </div>
  );
}
