/**
 * Renders a script tag containing serialized page props.
 * Used in the HTML template to enable client-side prop extraction.
 * @module
 */

export interface EcoPropsScriptProps {
	/** The page props to serialize for client-side hydration */
	data: Record<string, any>;
}

export const EcoPropsScript = ({ data }: EcoPropsScriptProps) => {
	return (
		<script id="__ECO_PROPS__" type="application/json">
			{JSON.stringify(data ?? {})}
		</script>
	);
};
