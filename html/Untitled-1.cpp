#include <iostream>

// Helper function to check if an element already exists in an array up to a certain index
bool isPresent(int arr[], int size, int element) {
    for (int i = 0; i < size; i++) {
        if (arr[i] == element) {
            return true;
        }
    }
    return false;
}

// Function to print the Union of two unsorted arrays
void printUnion(int arr1[], int size1, int arr2[], int size2) {
    std::cout << "Union: ";

    // 1. Print unique elements from the first array
    for (int i = 0; i < size1; i++) {
        // Only print if it hasn't been printed before (handles duplicates within arr1)
        if (!isPresent(arr1, i, arr1[i])) {
            std::cout << arr1[i] << " ";
        }
    }

    // 2. Print elements from the second array if they are not in arr1 and not duplicated in arr2
    for (int i = 0; i < size2; i++) {
        // Check if it's already in arr1
        if (!isPresent(arr1, size1, arr2[i])) {
            // Check if we already printed it from arr2 itself
            if (!isPresent(arr2, i, arr2[i])) {
                std::cout << arr2[i] << " ";
            }
        }
    }
    std::cout << std::endl;
}

// Function to print the Intersection of two unsorted arrays
void printIntersection(int arr1[], int size1, int arr2[], int size2) {
    std::cout << "Intersection: ";

    // Check every element of arr1
    for (int i = 0; i < size1; i++) {
        // Verify it exists in arr2
        if (isPresent(arr2, size2, arr1[i])) {
            // Ensure we haven't already processed/printed this common element
            if (!isPresent(arr1, i, arr1[i])) {
                std::cout << arr1[i] << " ";
            }
        }
    }
    std::cout << std::endl;
}

int main() {
    // Example unsorted arrays containing duplicate values
    int arr1[] = {1, 2, 4, 2, 6, 3};
    int arr2[] = {2, 3, 5, 6, 2, 7};

    int size1 = sizeof(arr1) / sizeof(arr1[0]);
    int size2 = sizeof(arr2) / sizeof(arr2[0]);

    std::cout << "Array 1: ";
    for(int i = 0; i < size1; i++) std::cout << arr1[i] << " ";
    std::cout << "\nArray 2: ";
    for(int i = 0; i < size2; i++) std::cout << arr2[i] << " ";
    std::cout << "\n\n";

    // Call functions
    printUnion(arr1, size1, arr2, size2);
    printIntersection(arr1, size1, arr2, size2);

    return 0;
}