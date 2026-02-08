declare module 'thirdweb' {
  export function createThirdwebClient(options: { clientId: string }): any;
  export function getContract(options: { client: any; chain: any; address: string; abi?: any }): any;
  export function prepareContractCall(options: { contract: any; method: string; params?: any[] }): any;
  export function toUnits(value: string, decimals: number): bigint;
  export function readContract(options: { contract: any; method: string; params?: any[] }): Promise<any>;
}

declare module 'thirdweb/chains' {
  export const baseSepolia: any;
  export const base: any;
  export const ethereum: any;
  export const sepolia: any;
}

declare module 'thirdweb/react' {
  export function ThirdwebProvider(props: { client: any; children: React.ReactNode }): JSX.Element;
  export function useActiveAccount(): { address: string } | undefined;
  export function useActiveWallet(): any;
  export function useDisconnect(): { disconnect: () => void };
  export function useReadContract(options: any): { data: any; isLoading: boolean; error: Error | null; refetch?: () => void };
  export function useSendTransaction(): { mutate: (tx: any, options?: { onSuccess?: (result: any) => void; onError?: (error: any) => void }) => void; isPending: boolean; error: Error | null };
  export function ConnectButton(props?: any): JSX.Element;
}
