import { Hex, keccak256, toBytes } from 'viem';

/**
 * The zero hash used for DEFAULT_ADMIN_ROLE in OpenZeppelin AccessControl
 */
export const DEFAULT_ADMIN_ROLE_HASH: Hex = '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Computes the correct role hash for a given role name
 * @param roleName - The role name (e.g., 'DEFAULT_ADMIN_ROLE', 'PAUSER_ROLE')
 * @returns The correct bytes32 hash for the role
 */
export function computeRoleHash(roleName: string): Hex {
  if (roleName === 'DEFAULT_ADMIN_ROLE') {
    return DEFAULT_ADMIN_ROLE_HASH;
  }
  
  try {
    // Hash the raw UTF-8 bytes of the string, matching OpenZeppelin's AccessControl
    return keccak256(toBytes(roleName));
  } catch (error) {
    console.error(`Error computing hash for role ${roleName}:`, error);
    throw error;
  }
}

/**
 * Creates a mapping from role hash to role name with consistent labels
 */
export function createRoleHashMap(roleNames: readonly string[]): { [hash: Hex]: string } {
  const hashMap: { [hash: Hex]: string } = {};
  
  roleNames.forEach(name => {
    try {
      hashMap[computeRoleHash(name)] = name;
    } catch (e) {
      console.error(`Error creating hash for role ${name}:`, e);
    }
  });
  
  // Only add DEFAULT_ADMIN_ROLE if not already present
  if (!(DEFAULT_ADMIN_ROLE_HASH in hashMap)) {
    hashMap[DEFAULT_ADMIN_ROLE_HASH] = 'DEFAULT_ADMIN_ROLE (Direct 0x00)';
  }
  
  return hashMap;
}

/**
 * Gets role names from ABI, handling readonly arrays
 */
export function getRoleNamesFromAbi(abi: readonly { type?: string; name?: string; inputs?: readonly unknown[]; outputs?: readonly { type?: string }[] }[]): string[] {
  const roleNames: string[] = [];
  
  abi.forEach(item => {
    if (item.type === 'function' && 
        item.name && 
        item.name.endsWith('_ROLE') &&
        item.inputs?.length === 0 &&
        item.outputs?.[0]?.type === 'bytes32') {
      roleNames.push(item.name);
    }
  });
  
  return roleNames;
}

/**
 * Gets role display label for UI consistency
 */
export function getRoleLabel(hash: Hex, hashMap: { [hash: Hex]: string }): string {
  return hashMap[hash] || `${hash.substring(0, 10)}...`;
} 