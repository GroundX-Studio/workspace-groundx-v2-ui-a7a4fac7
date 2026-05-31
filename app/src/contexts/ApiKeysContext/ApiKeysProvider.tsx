import { FC, ReactNode, useCallback, useState } from "react";

import { api } from "@/api";
import { RequestOptions } from "@/api/common";
import { GroundXApiKey } from "@/api/entities/sdkTypes";
import { useSdkRunner } from "@/contexts/createEntityContext";

import { ApiKeysContext } from "./ApiKeysContext";

export const ApiKeysProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const run = useSdkRunner("API key operation failed.");
  const [groundxApiKeys, setGroundXApiKeys] = useState<GroundXApiKey[]>([]);
  const [partnerApiKeys, setPartnerApiKeys] = useState<GroundXApiKey[]>([]);

  const listGroundXApiKeys = useCallback(
    (options?: RequestOptions) =>
      run(async () => {
        const response = await api.groundxApiKeys.listGroundXApiKeys(options);
        setGroundXApiKeys(response.apiKeys);
        return response.apiKeys;
      }),
    [run]
  );

  const createGroundXApiKey = useCallback(
    (name: string, options?: RequestOptions) =>
      run(async () => {
        const response = await api.groundxApiKeys.createGroundXApiKey(name, options);
        setGroundXApiKeys(response.apiKeys);
        return response.apiKeys;
      }, "API key created."),
    [run]
  );

  const renameGroundXApiKey = useCallback(
    (apiKey: string, name: string, options?: RequestOptions) =>
      run(async () => {
        const response = await api.groundxApiKeys.renameGroundXApiKey(apiKey, name, options);
        setGroundXApiKeys(response.apiKeys);
        return response.apiKeys;
      }, "API key renamed."),
    [run]
  );

  const deleteGroundXApiKey = useCallback(
    (apiKey: string, options?: RequestOptions) =>
      run(async () => {
        await api.groundxApiKeys.deleteGroundXApiKey(apiKey, options);
        setGroundXApiKeys((keys) => keys.filter((key) => key.apiKey !== apiKey));
      }, "API key deleted."),
    [run]
  );

  const listPartnerApiKeys = useCallback(
    (options?: RequestOptions) =>
      run(async () => {
        const response = await api.partnerApiKeys.listPartnerApiKeys(options);
        setPartnerApiKeys(response.apiKeys);
        return response.apiKeys;
      }),
    [run]
  );

  const createPartnerApiKey = useCallback(
    (name: string, options?: RequestOptions) =>
      run(async () => {
        const response = await api.partnerApiKeys.createPartnerApiKey(name, options);
        setPartnerApiKeys(response.apiKeys);
        return response.apiKeys;
      }, "API key created."),
    [run]
  );

  const renamePartnerApiKey = useCallback(
    (apiKey: string, name: string, options?: RequestOptions) =>
      run(async () => {
        const response = await api.partnerApiKeys.renamePartnerApiKey(apiKey, name, options);
        setPartnerApiKeys(response.apiKeys);
        return response.apiKeys;
      }, "API key renamed."),
    [run]
  );

  const deletePartnerApiKey = useCallback(
    (apiKey: string, options?: RequestOptions) =>
      run(async () => {
        await api.partnerApiKeys.deletePartnerApiKey(apiKey, options);
        setPartnerApiKeys((keys) => keys.filter((key) => key.apiKey !== apiKey));
      }, "API key deleted."),
    [run]
  );

  return (
    <ApiKeysContext.Provider
      value={{
        groundxApiKeys,
        partnerApiKeys,
        listGroundXApiKeys,
        createGroundXApiKey,
        renameGroundXApiKey,
        deleteGroundXApiKey,
        listPartnerApiKeys,
        createPartnerApiKey,
        renamePartnerApiKey,
        deletePartnerApiKey,
      }}
    >
      {children}
    </ApiKeysContext.Provider>
  );
};

