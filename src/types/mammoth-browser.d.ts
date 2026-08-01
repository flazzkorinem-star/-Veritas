declare module "mammoth/mammoth.browser" {
  interface Message {
    type: "warning" | "error";
    message: string;
  }

  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{
      value: string;
      messages: Message[];
    }>;
  };

  export default mammoth;
}
