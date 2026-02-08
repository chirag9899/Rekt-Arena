declare module 'thirdweb' {
  export function createThirdwebClient(options: { clientId: string }): any;
  export function getContract(options: { client: any; chain: any; address: string }): any;
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
  export function useReadContract(options: any): { data: any; isLoading: boolean; error: Error | null };
  export function useSendTransaction(): { mutate: (tx: any) => void; isPending: boolean; error: Error | null };
  export function ConnectButton(props?: any): JSX.Element;
}
