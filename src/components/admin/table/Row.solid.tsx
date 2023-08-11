import { onMount, useContext } from "solid-js";
import { ContextType, SelectedItemsContext } from "./SelectedRowContext.solid";

interface Props {
	data: (number | string)[]; // data[0] must always be the id of the item
	columnWidths: string;
	rows: number;
	index?: number;
	header?: boolean;
}

export default function Row(props: Props) {
	const [selectedItems, { add, remove }] = useContext(SelectedItemsContext) as ContextType;
	const { data, columnWidths, index = -1, rows } = props;
	const onClick = (e: MouseEvent) => {
		const i = Number((e.currentTarget as HTMLElement).dataset.id as string);
		const isSelected = selectedItems.includes(i);
		if (isSelected) remove(i);
		else add(i);
		(e.currentTarget as HTMLElement).classList.toggle("selectedRow");
	};
	const openToNewTab = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const url = (e.currentTarget as HTMLAnchorElement).href;
		window.open(url, "_blank");
	};
	if (props.header) {
		onMount(async () => {
			const container = document.querySelector(".data-container") as HTMLElement;
			if (container.scrollHeight > container.clientHeight) {
				document
					.querySelector(".header")
					//@ts-ignore
					?.style.setProperty("grid-template-columns", columnWidths.split(":")[1].slice(0, -2) + " 1ch");
			}
		});
	}
	return (
		<>
			<div
				onClick={onClick}
				data-id={data[0]}
				data-index={index}
				class={
					"row relative grid grid-flow-col justify-between justify-items-center items-center p-2 h-min gap-x-2 text-center text-lg bg-transparent " +
					"hover:shadow-md hover:shadow-gray-400 before:content-[''] before:absolute before:inset-0 before:-z-10 odd:before:bg-gray-100 " +
					(props?.header
						? "header absolute top-0 left-0 right-0 shadow-md shadow-gray-500 rounded-t-xl before:content-[none] hover:shadow-gray-500"
						: "")
				}
				style={columnWidths + ` z-index: ${(rows - index) * 10}`}
			>
				{data.map(item => {
					const isLink = typeof item === "string" && (item.startsWith("/") || item.startsWith("https"));
					if (isLink)
						return (
							<a
								href={item}
								onClick={openToNewTab}
								class="grid grid-cols-[auto_auto] place-items-center underline underline-offset-1"
							>
								<div>Προβολή</div>
								<i class="fa-solid fa-up-right-from-square"></i>
							</a>
						);
					return <div>{item === 0 ? "0" : item}</div>;
				})}
			</div>
		</>
	);
}
