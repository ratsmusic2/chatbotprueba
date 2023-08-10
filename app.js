const { createBot, createProvider, createFlow } = require('@bot-whatsapp/bot');
const QRPortalWeb = require('@bot-whatsapp/portal');
const BaileysProvider = require('@bot-whatsapp/provider/baileys');
const MockAdapter = require('@bot-whatsapp/database/mock');
const { SessionsClient } = require('@google-cloud/dialogflow-cx');
const openai = require('openai');
const dialogflow = require('@google-cloud/dialogflow-cx');

// Configurar la variable de entorno GOOGLE_APPLICATION_CREDENTIALS
process.env.GOOGLE_APPLICATION_CREDENTIALS = './credenciales/credenciales.json';

// Configuración de Dialogflow CX
const projectId = 'chatbot-393820';
const location = 'global';
const agentId = '28a652cb-78c8-4505-87c9-4f94721b9b4c'; // Reemplaza con el ID de tu agente de Dialogflow CX
const sessionsClient = new SessionsClient();

// Configuración de ChatGPT
const chatGptApiKey = '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'; // Reemplaza con tu clave de API de ChatGPT
const chatGptModel = 'gpt-3.5-turbo';

// Función para obtener flujos y respuestas desde Dialogflow CX
const getDialogflowFlows = async () => {
    try {
        // Obtener el cliente de Dialogflow CX
        const client = new dialogflow.FlowsClient();
      
        // Obtener los flujos del agente
        const [response] = await client.listFlows({
            parent: `projects/${projectId}/locations/${location}/agents/${agentId}`,
            
        });

        const flows = response.flow;
        console.log(flows)
        flows.forEach(flow => {
            console.log(`Nombre del flujo: ${flow.name}`);
          });

        if (!flows || flows.length === 0) {
            console.log('No se encontraron flujos de Dialogflow.');
            return [];
        }

        // Convertir los flujos a objetos
        const dialogflowFlows = flows.map((flow) => {
            return {
                name: flow.name,
                description: flow.displayName,
                // Agrega aquí la lógica para obtener respuestas de cada flujo si es necesario
            };
        });

        // Devolver los flujos
        return dialogflowFlows;
    } catch (error) {
        console.error('Error al obtener los flujos de Dialogflow:', error);
        return [];
    }
};

const processMessage = async (message) => {
    try {
        // Procesar el mensaje utilizando Dialogflow CX
        const sessionPath = sessionsClient.projectLocationAgentSessionPath(projectId, location, agentId, 'UNA_SESION_UNICA');
        const request = {
            session: sessionPath,
            queryInput: {
                text: {
                    text: message,
                },
            },
        };

        const [response] = await sessionsClient.detectIntent(request);
        const dialogflowResponse = response.queryResult.fulfillmentText;

        // Enviar el mensaje a ChatGPT
        const chatGptClient = new openai.ChatCompletion({
            apiKey: chatGptApiKey,
            engine: chatGptModel,
            prompt: dialogflowResponse,
            maxTokens: 150,
            stop: '\n',
        });

        const chatGptResponse = await chatGptClient.send();
        const chatGptFulfillment = chatGptResponse.choices[0].message.content.trim();

        return chatGptFulfillment;
    } catch (error) {
        console.error('Error en el proceso del mensaje:', error);
        return 'Lo siento, ha ocurrido un error en el procesamiento del mensaje.';
    }
};

const main = async () => {
    const adapterDB = new MockAdapter();
    
    // Obtener flujos y respuestas de Dialogflow CX
    const dialogflowFlows = await getDialogflowFlows();

    if (dialogflowFlows.length === 0) {
        console.log('No hay flujos disponibles para crear el bot.');
        return;
    }

    // Crear el flowPrincipal a partir de los flujos de Dialogflow CX
    const flowPrincipal = createFlow(dialogflowFlows);

    const adapterFlow = createFlow([flowPrincipal]);
    const adapterProvider = createProvider(BaileysProvider);

    createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
        onMessage: async (message, from) => {
            try {
                const response = await processMessage(message.body); // Obtener el cuerpo del mensaje de WhatsApp
                adapterProvider.sendTextMessage(from, response);
            } catch (error) {
                console.error('Error procesando el mensaje:', error);
            }
        },
    });

    QRPortalWeb();
};

main();
