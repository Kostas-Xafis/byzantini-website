export default function Spinner(props: { classes?: string }) {
	return (
		<>
			<div
				class={
					"w-full h-full grid grid-rows-[1fr] place-items-center" +
					(" " + (props.classes || ""))
				}>
				<div class="spinner w-[50px] aspect-square rounded-[50%] bg-red-900"></div>
			</div>
			<style>
				{`.spinner {
  background:
    radial-gradient(farthest-side, rgb(127,29,29) 94%,#0000) top/8px 8px no-repeat,
    conic-gradient(#0000 30%,rgb(127,29,29));
  -webkit-mask: radial-gradient(farthest-side,#0000 calc(100% - 8px),#000 0);
  animation: spin 1s infinite linear;
}

@keyframes spin{
  100%{transform: rotate(1turn)}
}
`}
			</style>
		</>
	);
}
