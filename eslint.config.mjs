     1|import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
     2|import nextTypescript from 'eslint-config-next/typescript';
     3|
     4|const APP_SOURCE_GLOBS = ['src/**/*.{js,jsx,ts,tsx,mjs,mts,cjs,cts}'];
     5|const SERVER_ONLY_NEXT_MODULES = new Set(['next/headers', 'next/server']);
     6|
     7|function hasLeadingDirective(program, directive) {
     8|	for (const statement of program.body) {
     9|		if (statement.type === 'ExpressionStatement' && typeof statement.directive === 'string') {
    10|			if (statement.directive === directive) {
    11|				return true;
    12|			}
    13|
    14|			continue;
    15|		}
    16|
    17|		break;
    18|	}
    19|
    20|	return false;
    21|}
    22|
    23|function hasAsyncTrueOption(node) {
    24|	if (!node || node.type !== 'ObjectExpression') {
    25|		return false;
    26|	}
    27|
    28|	return node.properties.some((property) => {
    29|		if (property.type !== 'Property' || property.kind !== 'init' || property.computed) {
    30|			return false;
    31|		}
    32|
    33|		const keyName =
    34|			property.key.type === 'Identifier'
    35|				? property.key.name
    36|				: property.key.type === 'Literal' && typeof property.key.value === 'string'
    37|					? property.key.value
    38|					: null;
    39|
    40|		return keyName === 'async' && property.value.type === 'Literal' && property.value.value === true;
    41|	});
    42|}
    43|
    44|function isGetCloudflareContextMember(callee, namespaceImports) {
    45|	if (
    46|		callee.type !== 'MemberExpression' ||
    47|		callee.object.type !== 'Identifier' ||
    48|		!namespaceImports.has(callee.object.name)
    49|	) {
    50|		return false;
    51|	}
    52|
    53|	if (!callee.computed && callee.property.type === 'Identifier') {
    54|		return callee.property.name === 'getCloudflareContext';
    55|	}
    56|
    57|	return callee.computed && callee.property.type === 'Literal' && callee.property.value === 'getCloudflareContext';
    58|}
    59|
    60|const templateGuardrails = {
    61|	rules: {
    62|		'no-async-get-cloudflare-context-option': {
    63|			meta: {
    64|				type: 'problem',
    65|				schema: [],
    66|				messages: {
    67|					preferAwait:
    68|						'Prefer `await getCloudflareContext()` over `getCloudflareContext({ async: true })` in generated template app code.',
    69|				},
    70|			},
    71|			create(context) {
    72|				const namedImports = new Set();
    73|				const namespaceImports = new Set();
    74|
    75|				return {
    76|					ImportDeclaration(node) {
    77|						if (node.source.value !== '@opennextjs/cloudflare') {
    78|							return;
    79|						}
    80|
    81|						for (const specifier of node.specifiers) {
    82|							if (
    83|								specifier.type === 'ImportSpecifier' &&
    84|								specifier.imported.type === 'Identifier' &&
    85|								specifier.imported.name === 'getCloudflareContext'
    86|							) {
    87|								namedImports.add(specifier.local.name);
    88|							}
    89|
    90|							if (specifier.type === 'ImportNamespaceSpecifier') {
    91|								namespaceImports.add(specifier.local.name);
    92|							}
    93|						}
    94|					},
    95|					CallExpression(node) {
    96|						if (!hasAsyncTrueOption(node.arguments[0])) {
    97|							return;
    98|						}
    99|
   100|						if (node.callee.type === 'Identifier' && namedImports.has(node.callee.name)) {
   101|							context.report({ node, messageId: 'preferAwait' });
   102|						}
   103|
   104|						if (isGetCloudflareContextMember(node.callee, namespaceImports)) {
   105|							context.report({ node, messageId: 'preferAwait' });
   106|						}
   107|					},
   108|				};
   109|			},
   110|		},
   111|		'no-server-next-imports-in-use-client': {
   112|			meta: {
   113|				type: 'problem',
   114|				schema: [],
   115|				messages: {
   116|					serverOnly:
   117|						'`{{moduleName}}` cannot be imported in a `use client` file. Move this code to a server module or pass the data in through props.',
   118|				},
   119|			},
   120|			create(context) {
   121|				let isUseClientFile = false;
   122|
   123|				function maybeReport(node, sourceValue) {
   124|					if (!isUseClientFile || !SERVER_ONLY_NEXT_MODULES.has(sourceValue)) {
   125|						return;
   126|					}
   127|
   128|					context.report({
   129|						node,
   130|						messageId: 'serverOnly',
   131|						data: { moduleName: sourceValue },
   132|					});
   133|				}
   134|
   135|				return {
   136|					Program(node) {
   137|						isUseClientFile = hasLeadingDirective(node, 'use client');
   138|					},
   139|					ImportDeclaration(node) {
   140|						if (typeof node.source.value === 'string') {
   141|							maybeReport(node.source, node.source.value);
   142|						}
   143|					},
   144|					ExportAllDeclaration(node) {
   145|						if (node.source && typeof node.source.value === 'string') {
   146|							maybeReport(node.source, node.source.value);
   147|						}
   148|					},
   149|					ExportNamedDeclaration(node) {
   150|						if (node.source && typeof node.source.value === 'string') {
   151|							maybeReport(node.source, node.source.value);
   152|						}
   153|					},
   154|					ImportExpression(node) {
   155|						if (node.source.type === 'Literal' && typeof node.source.value === 'string') {
   156|							maybeReport(node.source, node.source.value);
   157|						}
   158|					},
   159|				};
   160|			},
   161|		},
   162|	},
   163|};
   164|
   165|const eslintConfig = [
   166|	{
   167|		ignores: [
   168|			'.next/**',
   169|			'.open-next/**',
   170|			'.turbo/**',
   171|			'.wrangler/**',
   172|			'build/**',
   173|			'coverage/**',
   174|			'dist/**',
   175|			'node_modules/**',
   176|			'out/**',
   177|			'css.d.ts',
   178|			'next-env.d.ts',
   179|			'worker-configuration.d.ts',
   180|		],
   181|	},
   182|	...nextCoreWebVitals,
   183|	...nextTypescript,
   184|	{
   185|		linterOptions: {
   186|			reportUnusedDisableDirectives: 'error',
   187|		},
   188|	},
   189|	{
   190|		files: APP_SOURCE_GLOBS,
   191|		plugins: {
   192|			template: templateGuardrails,
   193|		},
   194|		rules: {
   195|			'no-restricted-imports': [
   196|				'error',
   197|				{
   198|					paths: [
   199|						{
   200|							name: '@opennextjs/cloudflare',
   201|							importNames: ['getRequestContext'],
   202|							message:
   203|								'Do not use `getRequestContext()` in generated template app code. Prefer `await getCloudflareContext()` instead.',
   204|						},
   205|						{
   206|							name: 'crypto',
   207|							message:
   208|								'Use platform Web Crypto globals such as `crypto.randomUUID()` or `crypto.subtle` instead of importing Node crypto in template app source.',
   209|						},
   210|						{
   211|							name: 'node:crypto',
   212|							message:
   213|								'Use platform Web Crypto globals such as `crypto.randomUUID()` or `crypto.subtle` instead of importing `node:crypto` in template app source.',
   214|						},
   215|						{
   216|							name: 'uuid',
   217|							message:
   218|								'Use `crypto.randomUUID()` instead of the `uuid` package in template app source.',
   219|						},
   220|					],
   221|				},
   222|			],
   223|			'template/no-async-get-cloudflare-context-option': 'error',
   224|			'template/no-server-next-imports-in-use-client': 'error',
   225|		},
   226|	},
   227|];
   228|
   229|export default eslintConfig;
   230|