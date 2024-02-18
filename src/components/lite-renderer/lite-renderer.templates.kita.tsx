export function Message({ text, numberOfClicks = 1 }: { text: string; numberOfClicks?: number }) {
  return (
    <div class="grig gap-2">
      <h1 class="text-2xl font-bold" safe>
        {`${text} - ${numberOfClicks} Times`}
      </h1>
      <p>This element has been rendered using @kitajs/html</p>
    </div>
  );
}
